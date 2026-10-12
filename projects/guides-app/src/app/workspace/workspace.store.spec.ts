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
                    return { ok: true, json: async () => structuredClone({ games }) };
                }
                const id = url.split('/')[3];
                const game = games.find((g) => g.id === id)!;
                const body = JSON.parse(options.body as string) as {
                    entries: Array<unknown>;
                    revision: number;
                };
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
