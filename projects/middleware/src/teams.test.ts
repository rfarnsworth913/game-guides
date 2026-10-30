import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { createApi } from './server';
import { ApiError } from './repository';
import { Security } from './auth';
import type { CatalogEntry, PlayerState } from '../../lib/types/workspace.type';
import { validProgressState } from '../../common/player/player-progress';
import type { Team } from '../../lib/types/team.type';
import { validTeams } from '../../common/player/teams';
import { emptyCharacterCollection, emptyCharacterDefinition, validCharacterRules } from '../../common/characters/characters';

const team: Team = { id: 'test', name: 'My team', members: ['one'], notes: '' };
const rules = {
    teamSize: 1,
    levelCap: 90,
    rarities: [5],
    weaponTypes: [],
    damageTypes: [],
    roles: [],
    equipmentSlots: [],
    progressionTracks: [],
};
const teamState = (teams: Team[]) => ({ completed: false, quantity: 0, target: 0, teams });
await test('team data rejects duplicate members, invalid names and misplaced personal state', () => {
    assert.equal(validTeams([team]), true);
    assert.equal(validTeams([{ ...team, members: ['one', 'one'] }]), false);
    assert.equal(validTeams([{ ...team, name: ' ' }]), false);
    assert.equal(validTeams([{ ...team, members: [] }]), false);
    assert.equal(validTeams([team, team]), false);
    assert.equal(validProgressState({ 'genshin/@teams': teamState([team]) }), true);
    assert.equal(validProgressState({ 'genshin/one': teamState([team]) }), false);
    assert.equal(
        validProgressState({
            'genshin/@teams': {
                ...teamState([team]),
                characterCollection: emptyCharacterCollection(),
            },
        }),
        false,
    );
    assert.equal(validCharacterRules(rules), true);
    assert.equal(validCharacterRules({ ...rules, teamSize: 0 }), false);
    assert.equal(validCharacterRules({ ...rules, teamSize: 13 }), false);
});

await test('team API isolates users and checks game capacity and ownership, including batched collection changes', async (t) => {
    const character: CatalogEntry = {
        id: 'one',
        game: 'genshin',
        kind: 'characters',
        name: 'One',
        notes: '',
        category: '',
        rarity: 5,
        order: 0,
        day: '',
        members: [],
        requirements: [],
        characterDefinition: emptyCharacterDefinition(),
    };
    const accounts = new Map<string, { revision: number; state: Record<string, PlayerState> }>();
    const security = {
        async handle() { return false; },
        async requireUser(request) {
            const id = request.headers.authorization?.replace('Bearer ', '');
            if (!id) {throw new ApiError(401, 'Sign in required');}
            return { id, name: id, editor: false, csrf: '' };
        },
        async requireEditor() {
            throw new ApiError(403, 'Editor required');
        },
    } as Security;
    const server = createApi(
        {
            async read(id) {
                return {
                    id,
                    name: id,
                    revision: 0,
                    entries: [character, { ...character, id: 'two' }],
                    characterRules: rules,
                };
            },
            async parsed() {
                return {};
            },
            async write() {
                throw new Error('Teams must not change the catalog');
            },
        },
        ['http://localhost:4200'],
        async () => true,
        '',
        security,
        {
            async read(user) {
                return structuredClone(accounts.get(user) ?? { revision: 0, state: {} });
            },
            async patch(user, revision, changes) {
                const current = accounts.get(user) ?? { revision: 0, state: {} };
                const next = { revision: revision + 1, state: { ...current.state, ...changes } };
                accounts.set(user, next);
                return next;
            },
        },
    );
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
    t.after(
        () =>
            new Promise<void>((resolve) => {
                server.close(() => resolve());
                server.closeAllConnections();
            }),
    );
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const patch = (changes: Record<string, PlayerState>, revision = 0, user = 'alice') =>
        fetch(base + '/api/me/progress', {
            method: 'PATCH',
            headers: {
                Authorization: 'Bearer ' + user,
                Origin: 'http://localhost:4200',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ revision, changes }),
        });
    assert.equal((await patch({ 'genshin/@teams': teamState([team]) })).status, 400);
    const owned = {
        completed: false,
        quantity: 0,
        target: 0,
        characterCollection: emptyCharacterCollection(),
    };
    assert.equal(
        (await patch({ 'genshin/one': owned, 'genshin/@teams': teamState([team]) })).status,
        200,
    );
    assert.equal((await patch({ 'genshin/@teams': teamState([team]) }, 0, 'bob')).status, 400);
    assert.equal(
        (
            await patch(
                {
                    'genshin/two': owned,
                    'genshin/@teams': teamState([{ ...team, members: ['one', 'two'] }]),
                },
                1,
            )
        ).status,
        400,
    );
    assert.equal((await patch({ 'hsr/@teams': teamState([team]) }, 1)).status, 400);
    assert.equal((await patch({ 'genshin/@teams': teamState([]) }, 1)).status, 200);
    assert.equal(accounts.get('alice')!.state['genshin/one'].characterCollection!.owned, true);
    assert.deepEqual(accounts.get('alice')!.state['genshin/@teams'].teams, []);
});
