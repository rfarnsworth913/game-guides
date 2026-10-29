import { signal } from '@angular/core';
import { WorkspaceStore, GAMES } from './workspace.store';
import { AuthStore } from './auth.store';
import { CatalogEntry, PlayerState } from '../../../../common/workspace';

const event: CatalogEntry = { id: 'parsed-event-test', game: 'genshin', kind: 'events', name: 'Daily Commissions',
    notes: '', category: 'daily', eventType: 'daily', startDate: '2026-10-29', endDate: '2026-10-29',
    wikiUrl: 'https://example.com/commissions', rarity: 1, members: [], requirements: [], order: 0, day: '' };

describe('Event completion persistence', () => {
    const accounts = new Map<string, Record<string, PlayerState>>();
    const storage = new Map<string, string>();
    const methods: string[] = [];
    async function request(account: string, path: string, init?: RequestInit): Promise<Response> {
        methods.push(init?.method ?? 'GET');
        let data: unknown;
        if (path === '/api/games') {
            data = { games: GAMES.map(game => ({ id: game.id, name: game.name, revision: 0, entries: game.id === 'genshin' ? [event] : [] })) };
        } else if (path === '/api/me/progress') {
            if (init?.method === 'PATCH') {
                const body = JSON.parse(init.body as string) as { changes: Record<string, PlayerState> };
                accounts.set(account, { ...accounts.get(account), ...body.changes });
            }
            data = { revision: 0, state: accounts.get(account) ?? {} };
        } else { throw new Error('Unexpected catalog write'); }
        return { ok: true, json: async () => structuredClone(data) } as Response;
    }
    function auth(account: string): AuthStore {
        return { user: signal({ id: account, name: account, editor: false }), initialize: async () => {},
            request: (path: string, init?: RequestInit) => request(account, path, init) } as unknown as AuthStore;
    }
    beforeEach(() => {
        accounts.clear(); storage.clear(); methods.length = 0;
        vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
        vi.stubGlobal('fetch', (path: string, init?: RequestInit) => request('guest', path, init));
    });
    afterEach(() => vi.unstubAllGlobals());
    it('saves and reloads personal completion without editing catalog data or another account', async () => {
        const alice = new WorkspaceStore(auth('alice'));
        expect(await alice.initialize()).toBe(true);
        expect(await alice.save({ ...alice.entries()[0], completed: true })).toBe(true);
        const restored = new WorkspaceStore(auth('alice'));
        await restored.initialize();
        expect(restored.entries()[0].completed).toBe(true);
        expect(restored.entries()[0].startDate).toBe(event.startDate);
        const bob = new WorkspaceStore(auth('bob')); await bob.initialize();
        expect(bob.entries()[0].completed).toBe(false);
        expect(methods).not.toContain('PUT');
        expect(methods).toContain('PATCH');
    });
    it('saves guest completion in the existing browser progress record', async () => {
        const guest = new WorkspaceStore(); await guest.initialize();
        expect(await guest.save({ ...guest.entries()[0], completed: true })).toBe(true);
        const restored = new WorkspaceStore(); await restored.initialize();
        expect(restored.entries()[0].completed).toBe(true);
        expect(storage.has('gg-player-v1')).toBe(true);
        expect(methods).not.toContain('PUT');
        expect(methods).not.toContain('PATCH');
    });
});
