import { signal } from '@angular/core';
import { WorkspaceStore, GAMES } from "../../../../core/state/workspace.store";
import { AuthStore } from "../../../../core/auth/auth.store";
import type { CatalogEntry, PlayerState } from "../../../../../../../lib/types/workspace.type";

const item: CatalogEntry = {
    id: 'book',
    game: 'genshin',
    kind: 'inventory',
    name: 'Talent book',
    notes: '',
    category: 'Talent',
    rarity: 3,
    members: [],
    requirements: [],
    order: 0,
    day: '',
    maxStack: 100,
};
describe('Inventory quantity persistence', () => {
    const accounts = new Map<string, { revision: number; state: Record<string, PlayerState> }>();
    const storage = new Map<string, string>();
    const methods: string[] = [];
    async function request(account: string, path: string, init?: RequestInit): Promise<Response> {
        methods.push(init?.method ?? 'GET');
        let data: unknown;
        if (path === '/api/games') {
            data = {
                games: GAMES.map((game) => ({
                    id: game.id,
                    name: game.name,
                    revision: 0,
                    entries:
                        game.id === 'genshin'
                            ? [item, { ...item, id: 'gem', name: 'Gemstone' }]
                            : [],
                })),
            };
        } else if (path === '/api/me/progress') {
            const current = accounts.get(account) ?? { revision: 0, state: {} };
            if (init?.method === 'PATCH') {
                const body = JSON.parse(init.body as string) as {
                    revision: number;
                    changes: Record<string, PlayerState>;
                };
                if (body.revision !== current.revision)
                    {return {
                        ok: false,
                        status: 409,
                        json: async () => ({ error: 'Conflict' }),
                    } as Response;}
                accounts.set(account, {
                    revision: current.revision + 1,
                    state: { ...current.state, ...body.changes },
                });
            }
            data = accounts.get(account) ?? current;
        } else {
            throw new Error('Inventory quantities must not write the shared catalog');
        }
        return { ok: true, json: async () => structuredClone(data) } as Response;
    }
    function auth(account: string): AuthStore {
        return {
            user: signal({ id: account, name: account, editor: false }),
            initialize: async () => {},
            request: (path: string, init?: RequestInit) => request(account, path, init),
        } as unknown as AuthStore;
    }
    beforeEach(() => {
        accounts.clear();
        storage.clear();
        methods.length = 0;
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => storage.set(key, value),
            removeItem: (key: string) => storage.delete(key),
        });
        vi.stubGlobal('fetch', (path: string, init?: RequestInit) => request('guest', path, init));
    });
    afterEach(() => vi.unstubAllGlobals());
    it('saves a batch privately for a non-editor and reloads it without catalog writes', async () => {
        const alice = new WorkspaceStore(auth('alice'));
        await alice.initialize();
        expect(await alice.saveInventoryQuantities('genshin', { book: 24, gem: 4 })).toBe(true);
        const restored = new WorkspaceStore(auth('alice'));
        await restored.initialize();
        expect(restored.entries().find((entry) => entry.id === 'book')!.quantity).toBe(24);
        const bob = new WorkspaceStore(auth('bob'));
        await bob.initialize();
        expect(bob.entries()[0].quantity).toBe(0);
        expect(methods.filter((method) => method === 'PATCH')).toHaveLength(1);
        expect(methods).not.toContain('PUT');
    });
    it('retains the saved quantity when another account tab edits the same item', async () => {
        const first = new WorkspaceStore(auth('alice')),
            second = new WorkspaceStore(auth('alice'));
        await first.initialize();
        await second.initialize();
        expect(await first.saveInventoryQuantities('genshin', { book: 10 })).toBe(true);
        expect(await second.saveInventoryQuantities('genshin', { book: 20 })).toBe(false);
        expect(accounts.get('alice')!.state['genshin/book'].quantity).toBe(10);
    });
    it('persists guest quantities, rejects stale tab overwrites and validates all batch values first', async () => {
        const first = new WorkspaceStore(),
            second = new WorkspaceStore();
        await first.initialize();
        await second.initialize();
        expect(await first.saveInventoryQuantities('genshin', { book: 7 })).toBe(true);
        expect(await second.saveInventoryQuantities('genshin', { book: 8 })).toBe(false);
        const restored = new WorkspaceStore();
        await restored.initialize();
        expect(restored.entries()[0].quantity).toBe(7);
        for (const quantity of [-1, 1.5, 101])
            {expect(
                await restored.saveInventoryQuantities('genshin', { book: quantity, gem: 2 }),
            ).toBe(false);}
        expect(restored.entries().find((entry) => entry.id === 'gem')!.quantity).toBe(0);
        expect(methods).not.toContain('PUT');
    });
});
