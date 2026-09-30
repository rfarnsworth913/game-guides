import { Entry, WorkspaceStore, validEntries, parseBackup } from './workspace.store';

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
    it('persists category order and moves achievements between categories atomically', () => {
        const store = new WorkspaceStore();
        store.replace([
            item('c1', 'achievement-category'),
            item('c2', 'achievement-category'),
            { ...item('a1', 'achievements'), category: 'c1', completed: true },
            { ...item('a2', 'achievements'), category: 'c1' },
        ]);
        expect(store.reorderAchievement('c2', 'c1')).toBe(true);
        expect(store.reorderAchievement('a2', 'a1', 'c1')).toBe(true);
        expect(store.reorderAchievement('a1', null, 'c2')).toBe(true);
        const restored = new WorkspaceStore().entries();
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
    it('rejects cross-game and invalid reorder destinations without changing data', () => {
        const store = new WorkspaceStore();
        store.replace([
            item('c1', 'achievement-category'),
            { ...item('c2', 'achievement-category'), game: 'zzz' },
            { ...item('a1', 'achievements'), category: 'c1' },
        ]);
        const before = store.entries();
        expect(store.reorderAchievement('a1', null, 'c2')).toBe(false);
        expect(store.reorderAchievement('c1', 'c2')).toBe(false);
        expect(store.reorderAchievement('a1', 'missing', 'c1')).toBe(false);
        expect(store.entries()).toEqual(before);
    });
    it('migrates standalone achievements without losing completion or requirements', () => {
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
    it('deletes a category with its achievements while preserving other categories', () => {
        const store = new WorkspaceStore();
        store.replace([
            item('category-a', 'achievement-category'),
            item('category-b', 'achievement-category'),
            { ...item('a', 'achievements'), category: 'category-a' },
            { ...item('b', 'achievements'), category: 'category-b' },
        ]);
        store.remove('category-a');
        expect(store.entries().map((e) => e.id)).toEqual(['category-b', 'b']);
    });
    it('rejects invalid optional achievement fields in backups', () => {
        expect(validEntries([{ ...item('bad', 'achievements'), reward: 42 }])).toBe(false);
    });
    let data: Map<string, string>;
    beforeEach(() => {
        data = new Map();
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key: string) => data.get(key) ?? null),
            setItem: vi.fn((key: string, value: string) => data.set(key, value)),
        });
    });
    afterEach(() => vi.unstubAllGlobals());
    it('restores saved entries across instances', () => {
        const store = new WorkspaceStore();
        expect(store.save(item('material'))).toBe(true);
        expect(new WorkspaceStore().entries()).toEqual([item('material')]);
    });
    it('aggregates shared requirements before subtracting inventory', () => {
        const store = new WorkspaceStore();
        const a = { ...item('a', 'plans'), requirements: [{ item: 'material', amount: 8 }] };
        const b = { ...item('b', 'plans'), requirements: [{ item: 'material', amount: 9 }] };
        store.replace([item('material'), a, b]);
        expect(store.materials([a, b])[0]).toMatchObject({ own: 10, need: 17, missing: 7 });
        expect(store.materials([a, { ...b, completed: true }])[0].missing).toBe(0);
    });
    it('preserves saved state when a write fails', () => {
        const store = new WorkspaceStore();
        store.save(item('original'));
        vi.mocked(localStorage.setItem).mockImplementation(() => {
            throw new Error('Quota');
        });
        expect(store.save(item('new'))).toBe(false);
        expect(store.entries().map((e) => e.id)).toEqual(['original']);
        expect(store.error()).toContain('Could not save');
    });
    it('does not overwrite malformed storage through ordinary editing', () => {
        data.set('gg-workspace-v1', '{broken');
        const store = new WorkspaceStore();
        expect(store.save(item('new'))).toBe(false);
        expect(data.get('gg-workspace-v1')).toBe('{broken');
    });
    it('removes deleted references from plans and teams', () => {
        const store = new WorkspaceStore();
        store.replace([
            item('material'),
            { ...item('plan', 'plans'), requirements: [{ item: 'material', amount: 5 }] },
        ]);
        store.remove('material');
        expect(store.entries()[0].requirements).toEqual([]);
    });
    it('rejects malformed or duplicate backup entries', () => {
        expect(validEntries([item('same'), item('same')])).toBe(false);
        expect(validEntries([{ ...item('bad'), quantity: -1 }])).toBe(false);
        expect(validEntries([{ ...item('bad'), requirements: [null] }])).toBe(false);
    });
});
