import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { Collection, Document } from 'mongodb';
import {
    CharacterRules,
    emptyCharacterDefinition,
    emptyCharacterCollection,
    validCharacterRules,
    validCharacterCollection,
} from '../../common/characters';
import {
    CatalogEntry,
    GameSnapshot,
    toCatalog,
    fromCatalog,
    validCatalog,
} from '../../common/workspace';
import { PlayerState } from '../../common/workspace';
import { validProgressState } from '../../common/player-progress';
import { GameRepository, ApiError } from './repository';
import { createApi } from './server';
import { Security } from './auth';

const rules: CharacterRules = {
    levelCap: 90,
    rarities: [4, 5],
    weaponTypes: ['Sword'],
    damageTypes: ['Physical'],
    roles: ['DPS', 'Support'],
    equipmentSlots: [
        { id: 'weapon', label: 'Weapon', limit: 1 },
        { id: 'accessories', label: 'Accessories', limit: 2 },
    ],
    progressionTracks: [{ id: 'ascension', label: 'Ascension', max: 6 }],
};
const character: CatalogEntry = {
    id: 'vesna',
    game: 'genshin',
    kind: 'characters',
    name: 'Vesna',
    rarity: 5,
    category: '',
    notes: '',
    order: 0,
    day: '',
    members: [],
    requirements: [],
    characterDefinition: {
        ...emptyCharacterDefinition(),
        weaponType: 'Sword',
        damageType: 'Physical',
        roles: ['DPS'],
        skills: [{ name: 'Strike', description: 'Attack' }],
        guides: [{ title: 'Build guide', url: 'https://example.com/vesna' }],
    },
};
const state: PlayerState = {
    completed: false,
    quantity: 0,
    target: 0,
    characterCollection: {
        ...emptyCharacterCollection(),
        level: 50,
        gear: { weapon: ['Excalibur'], accessories: ['Ring of Power', 'Amulet of Wisdom'] },
        progression: { ascension: 3 },
    },
};

test('character definitions exclude personal builds and validate nested data and safe guide links', () => {
    const shared = toCatalog(fromCatalog(character, state));
    assert.equal(validCatalog([shared], 'genshin'), true);
    assert.equal('characterCollection' in shared, false);
    assert.equal(
        validCatalog([{ ...shared, characterCollection: state.characterCollection }], 'genshin'),
        false,
    );
    assert.equal(
        validCatalog(
            [{ ...shared, characterDefinition: { ...character.characterDefinition, level: 50 } }],
            'genshin',
        ),
        false,
    );
    assert.equal(
        validCatalog(
            [
                {
                    ...shared,
                    characterDefinition: {
                        ...character.characterDefinition,
                        guides: [{ title: 'Bad', url: 'javascript:alert(1)' }],
                    },
                },
            ],
            'genshin',
        ),
        false,
    );
    assert.equal(validCharacterRules({ ...rules, levelCap: -1 }), false);
    assert.equal(
        validCharacterRules({
            ...rules,
            equipmentSlots: [...rules.equipmentSlots, rules.equipmentSlots[0]],
        }),
        false,
    );
    assert.equal(
        validCharacterCollection({
            ...state.characterCollection,
            gear: JSON.parse('{"__proto__":["bad"]}'),
        }),
        false,
    );
    assert.equal(validProgressState({ 'genshin/vesna': state }), true);
    assert.equal(
        validProgressState({
            'genshin/vesna': {
                ...state,
                characterCollection: { ...state.characterCollection, userId: 'bob' },
            },
        }),
        false,
    );
});

test('game-wide character rules survive catalog writes and remain separate from character definitions', async () => {
    let document: Document = {
        _id: 'game',
        name: 'Genshin Impact',
        _revision: 0,
        _schemaVersion: 2,
        characters: [character],
        achievements: [],
        story: [],
        inventory: [],
        events: [],
        plans: [],
        teams: [],
    };
    const collection = {
        findOne: async () => structuredClone(document),
        updateOne: async (filter: Document, update: Document) => {
            if (filter['_revision'] !== document['_revision']) return { matchedCount: 0 };
            document = { ...document, ...update['$set'] };
            return { matchedCount: 1 };
        },
    } as unknown as Collection<Document>;
    const repository = new GameRepository(collection, collection);
    await repository.write('genshin', [character], 0, rules);
    await repository.write('genshin', [{ ...character, name: 'Updated Vesna' }], 1);
    const saved = await repository.read('genshin');
    assert.deepEqual(saved.characterRules, rules);
    assert.equal(saved.entries[0].name, 'Updated Vesna');
    assert.equal('characterCollection' in document['characters'][0], false);
    assert.equal('characterRules' in document['characters'][0], false);
    await assert.rejects(
        repository.write('genshin', [character], 2, { ...rules, weaponTypes: ['Bow'] }),
        { status: 400 },
    );
});

test('character API isolates collections, checks shared rules, and keeps catalog edits editor-only', async (t) => {
    let snapshot: GameSnapshot = {
        id: 'genshin',
        name: 'Genshin Impact',
        revision: 0,
        entries: [character],
        characterRules: rules,
    };
    const accounts = new Map<string, { revision: number; state: Record<string, PlayerState> }>();
    let catalogWrites = 0;
    const security: Security = {
        async handle() {
            return false;
        },
        async requireUser(request) {
            const id = request.headers.authorization?.replace('Bearer ', '');
            if (!id) throw new ApiError(401, 'Sign in required');
            return { id, name: id, editor: id === 'editor', csrf: '' };
        },
        async requireEditor(request) {
            const user = await this.requireUser(request);
            if (!user.editor) throw new ApiError(403, 'Editor required');
            return user;
        },
    };
    const server = createApi(
        {
            async read() {
                return structuredClone(snapshot);
            },
            async parsed() {
                return {};
            },
            async write(_id, entries, revision, characterRules) {
                catalogWrites++;
                snapshot = {
                    ...snapshot,
                    entries,
                    revision: revision + 1,
                    ...(characterRules ? { characterRules } : {}),
                };
                return snapshot;
            },
        },
        ['http://localhost:4200'],
        async () => true,
        undefined,
        security,
        {
            async read(user) {
                return structuredClone(accounts.get(user) ?? { revision: 0, state: {} });
            },
            async patch(user, revision, changes) {
                const current = accounts.get(user) ?? { revision: 0, state: {} };
                if (revision !== current.revision) throw new ApiError(409, 'Stale progress');
                const next = { revision: revision + 1, state: { ...current.state, ...changes } };
                accounts.set(user, next);
                return next;
            },
        },
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(
        () =>
            new Promise<void>((resolve) => {
                server.close(() => resolve());
                server.closeAllConnections();
            }),
    );
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    const patch = (collection: unknown, user = 'alice', revision = 0) =>
        fetch(base + '/api/me/progress', {
            method: 'PATCH',
            headers: {
                Authorization: 'Bearer ' + user,
                Origin: 'http://localhost:4200',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                revision,
                changes: { 'genshin/vesna': { ...state, characterCollection: collection } },
            }),
        });
    assert.equal((await patch(state.characterCollection)).status, 200);
    assert.deepEqual(
        (
            await (
                await fetch(base + '/api/me/progress', { headers: { Authorization: 'Bearer bob' } })
            ).json()
        ).state,
        {},
    );
    assert.equal((await patch({ ...state.characterCollection, level: 91 }, 'bob')).status, 400);
    assert.equal(
        (await patch({ ...state.characterCollection, gear: { unknown: ['Item'] } }, 'bob')).status,
        400,
    );
    assert.equal(
        (await patch({ ...state.characterCollection, gear: { weapon: ['One', 'Two'] } }, 'bob'))
            .status,
        400,
    );
    assert.equal(
        (await patch({ ...state.characterCollection, progression: { ascension: 7 } }, 'bob'))
            .status,
        400,
    );
    assert.equal(
        (
            await fetch(base + '/api/games/genshin/catalog', {
                method: 'PUT',
                headers: {
                    Authorization: 'Bearer alice',
                    Origin: 'http://localhost:4200',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ revision: 0, entries: [character], characterRules: rules }),
            })
        ).status,
        403,
    );
    assert.equal(
        (await patch({ ...emptyCharacterCollection(), owned: false }, 'alice', 1)).status,
        200,
    );
    assert.equal(snapshot.entries.length, 1);
    assert.equal(catalogWrites, 0);
    const updateRules = (characterRules: unknown) =>
        fetch(base + '/api/games/genshin/catalog', {
            method: 'PUT',
            headers: {
                Authorization: 'Bearer editor',
                Origin: 'http://localhost:4200',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ revision: 0, entries: [character], characterRules }),
        });
    assert.equal((await updateRules({ ...rules, owned: true })).status, 400);
    assert.equal((await updateRules({ ...rules, levelCap: 100 })).status, 200);
    assert.equal(snapshot.characterRules?.levelCap, 100);
});
