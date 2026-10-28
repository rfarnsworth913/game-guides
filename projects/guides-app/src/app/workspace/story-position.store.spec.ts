import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthStore } from './auth.store';
import { StoryPositionStore } from './story-position.store';

describe('Story reading positions', () => {
    const user = signal<{ id: string } | null>(null);
    beforeEach(() => {
        const values = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key: string) => values.get(key) ?? null),
            setItem: vi.fn((key: string, value: string) => values.set(key, value)),
        });
        user.set(null);
        TestBed.configureTestingModule({ providers: [{ provide: AuthStore, useValue: { user } }] });
    });
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
    it('persists positions per game and isolates signed-in users from guests and each other', () => {
        const positions = TestBed.inject(StoryPositionStore);
        positions.remember('endfield', 'guest-section');
        user.set({ id: 'alice' });
        expect(positions.positions()['endfield']).toBeUndefined();
        positions.remember('endfield', 'alice-section', 'row-1');
        positions.remember('genshin', 'mondstadt');
        user.set({ id: 'bob' });
        expect(positions.positions()).toEqual({});
        user.set({ id: 'alice' });
        expect(positions.positions()['endfield']).toMatchObject({ entryId: 'alice-section', rowId: 'row-1' });
        const saved = JSON.parse(localStorage.getItem('gg-story-position-v1:alice')!);
        expect(saved['genshin'].entryId).toBe('mondstadt');
        user.set(null);
        expect(positions.positions()['endfield'].entryId).toBe('guest-section');
    });
    it('keeps a usable session position when storage is blocked', () => {
        vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error('Blocked'); });
        const positions = TestBed.inject(StoryPositionStore);
        positions.remember('endfield', 'section', 'row');
        expect(positions.positions()['endfield']).toMatchObject({ entryId: 'section', rowId: 'row' });
    });
    it('observes position changes from other tabs and ignores malformed bookmarks', () => {
        const positions = TestBed.inject(StoryPositionStore);
        positions.remember('endfield', 'old');
        localStorage.setItem('gg-story-position-v1:guest', JSON.stringify({ endfield: { entryId: 'new', visitedAt: 123 }, genshin: { entryId: 7 } }));
        window.dispatchEvent(new StorageEvent('storage', { key: 'gg-story-position-v1:guest' }));
        expect(positions.positions()).toEqual({ endfield: { entryId: 'new', visitedAt: 123 } });
    });
});
