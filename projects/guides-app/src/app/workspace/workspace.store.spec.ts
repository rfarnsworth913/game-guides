import { AuthStore } from './auth.store';
import { toCatalog } from '../../../../common/workspace';
import { Entry, WorkspaceStore, validEntries, parseBackup, GAMES } from './workspace.store';

const item = (id: string, kind: Entry['kind'] = 'inventory'): Entry => ({
    id,
    kind,
    game: 'genshin',
    name: id,
    notes: '',
    quantity: 10,
    target: 90,
    category: 'Materials',
    rarity: 5,
    members: [],
    requirements: [],
    completed: false,
    order: 1,
    day: 'Any day',
});
describe('WorkspaceStore', () => {
    let data: Map<string, string>;
    async function readyStore() {
        const store = new WorkspaceStore();
        await store.initialize();
        return store;
    }
    it('resets only current-game story completion locally across navigation categories', async () => {
        const store = await readyStore();
        const section = { ...item('section', 'story-category'), category: '' };
        const otherSection = { ...item('other-section', 'story-category'), game: 'hsr', category: '' };
        const story = { ...item('story', 'story'), category: 'lore', storySection: section.id,
            completed: true, storyRowCompletion: { row: true } };
        const other = { ...story, id: 'other-story', game: 'hsr', storySection: otherSection.id };
        const inventory = { ...item('inventory'), completed: true };
        expect(await store.replace([section, otherSection, story, other, inventory])).toBe(true);
        vi.mocked(fetch).mockClear();
        expect(await store.resetStoryProgress('genshin')).toBe(true);
        expect(fetch).not.toHaveBeenCalled();
        expect(store.entries().find((entry) => entry.id === story.id)).toMatchObject({ completed: false, storyRowCompletion: {} });
        expect(store.entries().find((entry) => entry.id === other.id)).toMatchObject({ completed: true, storyRowCompletion: { row: true } });
        expect(store.entries().find((entry) => entry.id === inventory.id)?.completed).toBe(true);
        expect((await readyStore()).entries().find((entry) => entry.id === story.id)?.completed).toBe(false);
    });
    it('stores definitions remotely and only player state locally; completion needs no API write', async () => {
        const store = await readyStore();
        await store.save(item('material'));
        const writes = vi
            .mocked(fetch)
            .mock.calls.filter(([, options]) => options?.method === 'PUT');
        expect(writes).toHaveLength(1);
        const request = JSON.parse(writes[0][1]!.body as string) as {
            entries: Array<Record<string, unknown>>;
        };
        expect(request.entries[0]).not.toHaveProperty('completed');
        expect(request.entries[0]).not.toHaveProperty('quantity');
        expect(request.entries[0]).not.toHaveProperty('target');
        expect(data.get('gg-player-v1')).not.toContain('Materials');
        vi.mocked(fetch).mockClear();
        await store.save({ ...item('material'), completed: true, quantity: 20 });
        expect(fetch).not.toHaveBeenCalled();
        expect(store.entries()[0]).toMatchObject({ completed: true, quantity: 20 });
    });
    it('migrates a legacy catalog and removes it only after server acknowledgement', async () => {
        data.set('gg-workspace-v1', JSON.stringify({ version: 1, entries: [item('legacy')] }));
        const store = await readyStore();
        expect(store.initialized()).toBe(true);
        expect(store.entries()[0]).toMatchObject({ id: 'legacy', quantity: 10 });
        expect(data.has('gg-workspace-v1')).toBe(false);
        expect((await readyStore()).entries()[0]).toMatchObject({ id: 'legacy', quantity: 10 });
    });
    it('does not save definitions when the API returns properties in a different order', async () => {
        const { completed, quantity, target, ...shared } = item('remote');
        const shuffled = Object.fromEntries(Object.entries(shared).reverse());
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => ({
                games: GAMES.map((game) => ({
                    id: game.id,
                    name: game.name,
                    revision: 0,
                    entries: game.id === 'genshin' ? [shuffled] : [],
                })),
            }),
        } as Response);
        const store = await readyStore();
        vi.mocked(fetch).mockClear();
        expect(await store.save({ ...store.entries()[0], completed: true })).toBe(true);
        expect(fetch).not.toHaveBeenCalled();
    });
    it('keeps the legacy catalog intact when middleware is unavailable', async () => {
        data.set('gg-workspace-v1', JSON.stringify({ version: 1, entries: [item('legacy')] }));
        vi.mocked(fetch).mockRejectedValue(new Error('Offline'));
        const store = await readyStore();
        expect(store.initialized()).toBe(false);
        expect(data.has('gg-workspace-v1')).toBe(true);
    });
    it('does not report success or replace shared entries when the server rejects a stale save', async () => {
        const store = await readyStore();
        await store.save(item('original'));
        vi.mocked(fetch).mockResolvedValue({
            ok: false,
            json: async () => ({ error: 'This game changed in another session.' }),
        } as Response);
        expect(await store.save({ ...item('original'), name: 'Changed' })).toBe(false);
        expect(store.entries()[0].name).toBe('original');
        expect(store.error()).toContain('another session');
    });
    it('persists category order and moves achievements between categories atomically', async () => {
        const store = await readyStore();
        await store.replace([
            item('c1', 'achievement-category'),
            item('c2', 'achievement-category'),
            { ...item('a1', 'achievements'), category: 'c1', completed: true },
            { ...item('a2', 'achievements'), category: 'c1' },
        ]);
        expect(await store.reorderAchievement('c2', 'c1')).toBe(true);
        expect(await store.reorderAchievement('a2', 'a1', 'c1')).toBe(true);
        expect(await store.reorderAchievement('a1', null, 'c2')).toBe(true);
        const restored = (await readyStore()).entries();
        expect(
            restored
                .filter((e) => e.kind === 'achievement-category')
                .sort((a, b) => a.order - b.order)
                .map((e) => e.id),
        ).toEqual(['c2', 'c1']);
        expect(restored.find((e) => e.id === 'a1')).toMatchObject({
            category: 'c2',
            completed: true,
            order: 0,
        });
    });
    it('rebases edits to separate story sections across two tabs without refreshing', async () => {
        const first = await readyStore();
        const category = { ...item('region', 'story-category'), category: '' };
        const a = { ...item('a', 'story'), category: 'main-story', storySection: 'region' };
        const b = { ...a, id: 'b', name: 'b' };
        await first.replace([category, a, b]);
        const second = await readyStore();
        expect(await first.save({ ...a, name: 'Saved in first tab' })).toBe(true);
        expect(await second.save({ ...b, name: 'Saved in second tab' })).toBe(true);
        expect(second.error()).toBe('');
        expect(second.entries().find(e => e.id === 'a')?.name).toBe('Saved in first tab');
        expect(second.entries().find(e => e.id === 'b')?.name).toBe('Saved in second tab');
        expect((await readyStore()).entries()).toEqual(second.entries());
    });
    it('rejects overlapping edits and does not resurrect an item deleted by another tab', async () => {
        const first = await readyStore();
        await first.replace([item('a'), item('b')]);
        const second = await readyStore();
        await first.save({ ...item('a'), name: 'First tab title' });
        expect(await second.save({ ...item('a'), name: 'Conflicting title' })).toBe(false);
        expect(second.error()).toContain('same content');
        expect((await readyStore()).entries().find(e => e.id === 'a')?.name).toBe('First tab title');
        const third = await readyStore();
        await first.remove('b');
        expect(await third.save(item('new'))).toBe(true);
        expect(third.entries().map(e => e.id).sort()).toEqual(['a', 'new']);
    });
    it('preserves unrelated guest progress saved in another tab', async () => {
        const first = await readyStore();
        await first.replace([item('a'), item('b')]);
        const second = await readyStore();
        await first.save({ ...item('a'), completed: true });
        expect(await second.save({ ...item('b'), completed: true })).toBe(true);
        expect(second.entries().every(e => e.completed)).toBe(true);
    });
    it('rejects cross-game and invalid reorder destinations without changing data', async () => {
        const store = await readyStore();
        await store.replace([
            item('c1', 'achievement-category'),
            { ...item('c2', 'achievement-category'), game: 'zzz' },
            { ...item('a1', 'achievements'), category: 'c1' },
        ]);
        const before = store.entries();
        expect(await store.reorderAchievement('a1', null, 'c2')).toBe(false);
        expect(await store.reorderAchievement('c1', 'c2')).toBe(false);
        expect(await store.reorderAchievement('a1', 'missing', 'c1')).toBe(false);
        expect(store.entries()).toEqual(before);
    });
    it('migrates standalone achievements without losing completion or requirements', async () => {
        const old = {
            ...item('first', 'achievements'),
            notes: 'Find all waypoints',
            completed: true,
        };
        const migrated = parseBackup(JSON.stringify({ version: 1, entries: [old] }));
        const category = migrated.find((e) => e.kind === 'achievement-category');
        expect(category?.name).toBe('General');
        expect(migrated[0]).toMatchObject({
            category: category?.id,
            completed: true,
            requirementText: 'Find all waypoints',
        });
        expect(parseBackup(JSON.stringify({ version: 1, entries: migrated }))).toEqual(migrated);
    });
    it('deletes a category with its achievements while preserving other categories', async () => {
        const store = await readyStore();
        await store.replace([
            item('category-a', 'achievement-category'),
            item('category-b', 'achievement-category'),
            { ...item('a', 'achievements'), category: 'category-a' },
            { ...item('b', 'achievements'), category: 'category-b' },
        ]);
        await store.remove('category-a');
        expect(
            store
                .entries()
                .map((e) => e.id)
                .sort(),
        ).toEqual(['b', 'category-b']);
    });
    it('rejects invalid optional achievement fields in backups', async () => {
        expect(validEntries([{ ...item('bad', 'achievements'), reward: 42 }])).toBe(false);
    });
    beforeEach(() => {
        data = new Map();
        const games = GAMES.map((game) => ({
            id: game.id,
            name: game.name,
            revision: 0,
            entries: [] as Array<unknown>,
        }));
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, options?: RequestInit) => {
                if (!options?.body) {
                    return { ok: true, json: async () => structuredClone(url === '/api/games' ? { games } : games.find(g => g.id === url.split('/')[3])) };
                }
                const id = url.split('/')[3];
                const game = games.find((g) => g.id === id)!;
                const body = JSON.parse(options.body as string) as {
                    entries: Array<unknown>;
                    revision: number;
                };
                if (body.revision !== game.revision) return { ok: false, status: 409, json: async () => ({ error: 'This game changed in another session.' }) };
                game.entries = body.entries;
                game.revision++;
                return { ok: true, json: async () => structuredClone(game) };
            }),
        );

        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key: string) => data.get(key) ?? null),
            setItem: vi.fn((key: string, value: string) => data.set(key, value)),
            removeItem: vi.fn((key: string) => data.delete(key)),
        });
    });
    afterEach(() => vi.unstubAllGlobals());
    it('restores saved entries across instances', async () => {
        const store = await readyStore();
        expect(await store.save(item('material'))).toBe(true);
        expect((await readyStore()).entries()).toEqual([item('material')]);
    });
    it('persists patch row completion locally without writing definitions and restores it on reload', async () => {
        const store = await readyStore();
        const section = { ...item('section', 'story-category'), category: '' };
        const patch = {
            ...item('patch', 'story'),
            category: 'patch-overview',
            storySection: section.id,
            patchOverview: {
                imageUrl: '',
                imageAlt: '',
                sourceName: '',
                sourceUrl: '',
                rows: [
                    {
                        id: 'row-1',
                        contentType: 'Story',
                        content: 'Chapter',
                        patch: '6.0',
                        notes: '',
                    },
                ],
            },
        };
        expect(await store.replace([section, patch])).toBe(true);
        vi.mocked(fetch).mockClear();
        expect(await store.save({ ...patch, storyRowCompletion: { 'row-1': true } })).toBe(true);
        expect(fetch).not.toHaveBeenCalled();
        const restored = await readyStore();
        expect(restored.entries().find((entry) => entry.id === patch.id)).toMatchObject({
            storyRowCompletion: { 'row-1': true },
            completed: true,
        });
    });
    it('migrates legacy story progress and removes a section together with its own subsections', async () => {
        data.set(
            'gg-workspace-v1',
            JSON.stringify({
                version: 1,
                entries: [{ ...item('prologue', 'story'), completed: true }],
            }),
        );
        const store = await readyStore();
        const section = store.entries().find((entry) => entry.kind === 'story-category')!;
        expect(section.name).toBe('General');
        expect(store.entries().find((entry) => entry.id === 'prologue')).toMatchObject({
            completed: true,
            storySection: section.id,
        });
        await store.save(item('unrelated'));
        expect(await store.remove(section.id)).toBe(true);
        expect(store.entries().map((entry) => entry.id)).toEqual(['unrelated']);
    });
    it('aggregates shared requirements before subtracting inventory', async () => {
        const store = await readyStore();
        const a = { ...item('a', 'plans'), requirements: [{ item: 'material', amount: 8 }] };
        const b = { ...item('b', 'plans'), requirements: [{ item: 'material', amount: 9 }] };
        await store.replace([item('material'), a, b]);
        expect(store.materials([a, b])[0]).toMatchObject({ own: 10, need: 17, missing: 7 });
        expect(store.materials([a, { ...b, completed: true }])[0].missing).toBe(0);
    });
    it('preserves saved state when a write fails', async () => {
        const store = await readyStore();
        await store.save(item('original'));
        vi.mocked(localStorage.setItem).mockImplementation(() => {
            throw new Error('Quota');
        });
        expect(await store.save(item('new'))).toBe(false);
        expect(store.entries().map((e) => e.id)).toEqual(['original']);
        expect(store.error()).toContain('Could not save');
    });
    it('does not overwrite malformed storage through ordinary editing', async () => {
        data.set('gg-workspace-v1', '{broken');
        const store = await readyStore();
        expect(await store.save(item('new'))).toBe(false);
        expect(data.get('gg-workspace-v1')).toBe('{broken');
    });
    it('removes deleted references from plans and teams', async () => {
        const store = await readyStore();
        await store.replace([
            item('material'),
            { ...item('plan', 'plans'), requirements: [{ item: 'material', amount: 5 }] },
        ]);
        await store.remove('material');
        expect(store.entries()[0].requirements).toEqual([]);
    });
    it('rejects malformed or duplicate backup entries', async () => {
        expect(validEntries([item('same'), item('same')])).toBe(false);
        expect(validEntries([{ ...item('bad'), quantity: -1 }])).toBe(false);
        expect(validEntries([{ ...item('bad'), requirements: [null] }])).toBe(false);
    });
});


describe('Account progress syncing', () => {
    let guest: Map<string, string>;
    let remote: { revision: number; state: Record<string, { completed: boolean; quantity: number; target: number; storyRowCompletion?: Record<string, boolean> }> };
    let conflict: boolean;
    let signedIn: boolean;
    const accountItem = item('material');
    beforeEach(() => {
        guest = new Map(); conflict = false; signedIn = true;
        remote = { revision: 2, state: { 'genshin/material': { completed: false, quantity: 3, target: 10 } } };
        vi.stubGlobal('localStorage', { getItem: vi.fn((key: string) => guest.get(key) ?? null),
            setItem: vi.fn((key: string, value: string) => guest.set(key, value)), removeItem: vi.fn((key: string) => guest.delete(key)) });
        vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
            if (url === '/api/auth/session') return { ok: true, json: async () => ({ configured: true,
                user: signedIn ? { id: 'alice', name: 'Alice', editor: false } : null, csrf: signedIn ? 'csrf-token' : null }) };
            if (url === '/api/games') return { ok: true, json: async () => ({ games: GAMES.map((game) => ({ id: game.id, name: game.name, revision: 0,
                entries: game.id === 'genshin' ? [toCatalog(accountItem)] : [] })) }) };
            if (url === '/api/me/progress') {
                if (options?.method === 'PATCH') {
                    const body = JSON.parse(options.body as string);
                    expect(new Headers(options.headers).get('X-CSRF-Token')).toBe('csrf-token');
                    if (conflict || body.revision !== remote.revision) return { ok: false, status: 409, json: async () => ({ error: 'Progress changed in another browser. Reload before retrying.' }) };
                    remote = { revision: remote.revision + 1, state: { ...remote.state, ...body.changes } };
                }
                return { ok: true, json: async () => structuredClone(remote) };
            }
            throw new Error('Unexpected request: ' + url);
        }));
    });
    afterEach(() => vi.unstubAllGlobals());
    const ready = async () => { const store = new WorkspaceStore(new AuthStore()); await store.initialize(); return store; };
    it('loads account state without importing guest data and sends completion changes with CSRF and revision', async () => {
        guest.set('gg-player-v1', JSON.stringify({ version: 1, state: { 'genshin/material': { completed: true, quantity: 99, target: 90 } } }));
        const original = guest.get('gg-player-v1');
        const store = await ready();
        expect(store.entries()[0]).toMatchObject({ completed: false, quantity: 3 });
        expect(store.canEdit()).toBe(false);
        expect(await store.save({ ...store.entries()[0], completed: true })).toBe(true);
        expect(remote.revision).toBe(3);
        expect(remote.state['genshin/material'].completed).toBe(true);
        expect(guest.get('gg-player-v1')).toBe(original);
        expect((await ready()).entries()[0].completed).toBe(true);
    });
    it('does not overwrite remote or displayed account state after a conflict', async () => {
        const store = await ready(); conflict = true;
        expect(await store.save({ ...store.entries()[0], completed: true })).toBe(false);
        expect(remote.revision).toBe(2);
        expect(store.entries()[0].completed).toBe(false);
        expect(store.error()).toContain('Try saving again shortly');
        expect(localStorage.setItem).not.toHaveBeenCalled();
    });
    it('automatically retries stale account revisions while preserving changes from another tab', async () => {
        const store = await ready();
        remote = { revision: 3, state: { ...remote.state, 'genshin/material': { ...remote.state['genshin/material'], quantity: 7 } } };
        expect(await store.save({ ...store.entries()[0], completed: true })).toBe(true);
        expect(remote.state['genshin/material']).toMatchObject({ quantity: 7, completed: true });
        expect(store.entries()[0]).toMatchObject({ quantity: 7, completed: true });
        expect(remote.revision).toBe(4);
        expect(store.error()).toBe('');
    });
    it('merges completion of separate rows without losing the other tab\'s first completion', async () => {
        const store = await ready();
        remote = { revision: 3, state: { 'genshin/material': { ...remote.state['genshin/material'], storyRowCompletion: { other: true } } } };
        expect(await store.save({ ...store.entries()[0], storyRowCompletion: { mine: true } })).toBe(true);
        expect(remote.state['genshin/material'].storyRowCompletion).toEqual({ other: true, mine: true });
    });
    it('does not overwrite a quantity changed differently in both tabs', async () => {
        const store = await ready();
        remote = { revision: 3, state: { 'genshin/material': { ...remote.state['genshin/material'], quantity: 7 } } };
        expect(await store.save({ ...store.entries()[0], quantity: 9 })).toBe(false);
        expect(remote.state['genshin/material'].quantity).toBe(7);
        expect(remote.revision).toBe(3);
        expect(store.error()).toContain('same content');
    });
    it('merges guest progress only after explicit import and retains the guest copy', async () => {
        guest.set('gg-player-v1', JSON.stringify({ version: 1, state: { 'genshin/material': { completed: true, quantity: 1, target: 90 } } }));
        const store = await ready();
        expect(remote.revision).toBe(2);
        expect(store.guestImport()['genshin/material']).toMatchObject({ completed: true, quantity: 3, target: 90 });
        expect(remote.revision).toBe(2);
        expect(await store.importGuestProgress()).toBe(true);
        expect(remote.state['genshin/material']).toMatchObject({ completed: true, quantity: 3, target: 90 });
        expect(guest.has('gg-player-v1')).toBe(true);
    });
    it('rejects catalog changes for ordinary accounts', async () => {
        const store = await ready();
        expect(await store.save({ ...store.entries()[0], name: 'Unauthorized change' })).toBe(false);
        expect(store.error()).toContain('editor account');
        expect(remote.revision).toBe(2);
    });
    it('clears account data before loading guest data after an account change', async () => {
        const store = await ready(); signedIn = false;
        await store.initialize();
        expect(store.entries()[0]).toMatchObject({ completed: false, quantity: 0 });
        expect(store.auth?.user()).toBeNull();
    });
});
