import { signal } from '@angular/core';
import { WorkspaceStore, GAMES, Entry } from './workspace.store';
import { AuthStore } from './auth.store';
import {
    CharacterRules,
    emptyCharacterCollection,
    emptyCharacterDefinition,
} from '../../../../common/characters';
import { GameSnapshot, PlayerState, toCatalog, parseBackup } from '../../../../common/workspace';

const rules: CharacterRules = {
    levelCap: 90,
    rarities: [4, 5],
    weaponTypes: [],
    damageTypes: [],
    roles: [],
    equipmentSlots: [{ id: 'weapon', label: 'Weapon', limit: 1 }],
    progressionTracks: [],
};
const character: Entry = {
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
    completed: false,
    quantity: 0,
    target: 0,
    characterDefinition: emptyCharacterDefinition(),
};

describe('Character collection persistence', () => {
    let local: Map<string, string>;
    let accounts: Map<string, { revision: number; state: Record<string, PlayerState> }>;
    let snapshots: GameSnapshot[];
    let requests: { account: string; path: string; method: string }[];
    async function request(account: string, path: string, init?: RequestInit): Promise<Response> {
        const method = init?.method ?? 'GET';
        requests.push({ account, path, method });
        if (path === '/api/games')
            return {
                ok: true,
                json: async () => structuredClone({ games: snapshots }),
            } as Response;
        if (path === '/api/me/progress') {
            let value = accounts.get(account) ?? { revision: 0, state: {} };
            if (method === 'PATCH') {
                const body = JSON.parse(init!.body as string);
                value = {
                    revision: value.revision + 1,
                    state: { ...value.state, ...body.changes },
                };
                accounts.set(account, value);
            }
            return { ok: true, json: async () => structuredClone(value) } as Response;
        }
        if (method === 'PUT') {
            const body = JSON.parse(init!.body as string);
            const game = snapshots.find((game) => path.includes('/' + game.id + '/'))!;
            game.entries = body.entries;
            game.characterRules = body.characterRules ?? game.characterRules;
            game.revision++;
            return { ok: true, json: async () => structuredClone(game) } as Response;
        }
        throw new Error('Unexpected request ' + path);
    }
    function auth(account: string, editor = false): AuthStore {
        return {
            user: signal({ id: account, name: account, editor }),
            initialize: async () => {},
            request: (path: string, init?: RequestInit) => request(account, path, init),
        } as unknown as AuthStore;
    }
    beforeEach(() => {
        local = new Map();
        accounts = new Map();
        requests = [];
        snapshots = GAMES.map((game) => ({
            id: game.id,
            name: game.name,
            revision: 0,
            entries: game.id === 'genshin' ? [toCatalog(character)] : [],
            ...(game.id === 'genshin' ? { characterRules: rules } : {}),
        }));
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key: string) => local.get(key) ?? null),
            setItem: vi.fn((key: string, value: string) => local.set(key, value)),
            removeItem: vi.fn(),
        });
        vi.stubGlobal(
            'fetch',
            vi.fn((path: string, init?: RequestInit) => request('guest', path, init)),
        );
    });
    afterEach(() => vi.unstubAllGlobals());
    it('lets a player add, edit, reload and remove a personal build without modifying the shared character', async () => {
        const alice = new WorkspaceStore(auth('alice'));
        await alice.initialize();
        expect(alice.canEdit()).toBe(false);
        expect(
            await alice.saveCharacterCollection('vesna', {
                ...emptyCharacterCollection(),
                level: 50,
                gear: { weapon: ['Excalibur'] },
            }),
        ).toBe(true);
        const bob = new WorkspaceStore(auth('bob'));
        await bob.initialize();
        expect(bob.entries()[0].characterCollection).toBeUndefined();
        const reloaded = new WorkspaceStore(auth('alice'));
        await reloaded.initialize();
        expect(reloaded.entries()[0].characterCollection).toMatchObject({
            level: 50,
            owned: true,
            gear: { weapon: ['Excalibur'] },
        });
        expect(
            await reloaded.saveCharacterCollection('vesna', {
                ...emptyCharacterCollection(),
                level: 60,
            }),
        ).toBe(true);
        expect(
            await reloaded.saveCharacterCollection('vesna', {
                ...emptyCharacterCollection(),
                owned: false,
            }),
        ).toBe(true);
        expect(reloaded.entries()[0].characterCollection?.owned).toBe(false);
        expect(snapshots[0].entries[0]).toEqual(toCatalog(character));
        expect(requests.filter((request) => request.method === 'PUT')).toHaveLength(0);
        expect(local.has('gg-player-v1')).toBe(false);
    });
    it('persists guest collections locally and imports them only with the explicit account action', async () => {
        const guest = new WorkspaceStore();
        await guest.initialize();
        await guest.saveCharacterCollection('vesna', { ...emptyCharacterCollection(), level: 25 });
        const restored = new WorkspaceStore();
        await restored.initialize();
        expect(restored.entries()[0].characterCollection?.level).toBe(25);
        const alice = new WorkspaceStore(auth('alice'));
        await alice.initialize();
        expect(alice.entries()[0].characterCollection).toBeUndefined();
        expect(await alice.importGuestProgress()).toBe(true);
        expect(alice.entries()[0].characterCollection?.level).toBe(25);
        expect(local.has('gg-player-v1')).toBe(true);
    });
    it('blocks invalid levels and cross-game slots, and reserves game rules for editors', async () => {
        const alice = new WorkspaceStore(auth('alice'));
        await alice.initialize();
        expect(
            await alice.saveCharacterCollection('vesna', {
                ...emptyCharacterCollection(),
                level: 91,
            }),
        ).toBe(false);
        expect(
            await alice.saveCharacterCollection('vesna', {
                ...emptyCharacterCollection(),
                gear: { armor: ['Item'] },
            }),
        ).toBe(false);
        expect(await alice.saveCharacterRules('genshin', rules)).toBe(false);
        expect(requests.filter((request) => request.method !== 'GET')).toHaveLength(0);
        const editor = new WorkspaceStore(auth('editor', true));
        await editor.initialize();
        expect(await editor.saveCharacterRules('genshin', { ...rules, levelCap: 100 })).toBe(true);
        expect(editor.characterRules()['genshin'].levelCap).toBe(100);
        expect(editor.entries()[0].characterCollection).toBeUndefined();
    });
    it('restores shared game rules together with catalog data and rejects malformed rule backups', async () => {
        const editor = new WorkspaceStore(auth('editor', true));
        await editor.initialize();
        const backup = {
            version: 1,
            entries: editor.entries(),
            characterRules: { genshin: { ...rules, levelCap: 100 } },
        };
        const entries = parseBackup(JSON.stringify(backup));
        expect(await editor.replace(entries, backup.characterRules)).toBe(true);
        expect(editor.characterRules()['genshin'].levelCap).toBe(100);
        expect(() =>
            parseBackup(
                JSON.stringify({
                    ...backup,
                    characterRules: { genshin: { ...rules, levelCap: -1 } },
                }),
            ),
        ).toThrow();
    });
});
