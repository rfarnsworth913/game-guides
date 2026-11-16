import { TestBed } from '@angular/core/testing';
import { GameNavigationPreferences } from './game-navigation-preferences';

describe('Game navigation preferences', () => {
    const values = new Map<string, string>();
    beforeEach(() => {
        values.clear();
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key: string) => values.get(key) ?? null),
            setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
        });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('persists favorites and unique recent games across service recreation', () => {
        const preferences = TestBed.inject(GameNavigationPreferences);
        preferences.toggleFavorite('genshin');
        preferences.remember('hsr');
        preferences.remember('genshin');
        preferences.remember('hsr');
        TestBed.resetTestingModule();
        const restored = TestBed.inject(GameNavigationPreferences);
        expect(restored.favoriteGameIds()).toEqual(['genshin']);
        expect(restored.recentGameIds()).toEqual(['hsr', 'genshin']);
        restored.toggleFavorite('genshin');
        expect(restored.favoriteGameIds()).toEqual([]);
        expect(JSON.parse(values.get('gg-game-navigation-v1')!) as unknown).toEqual({ version: 1, favorites: [], recent: ['hsr', 'genshin'] });
    });

    it.each(['broken json', '{"version":2,"favorites":["genshin"],"recent":[]}', 'null'])('ignores invalid stored preferences: %s', raw => {
        values.set('gg-game-navigation-v1', raw);
        const preferences = TestBed.inject(GameNavigationPreferences);
        expect(preferences.favoriteGameIds()).toEqual([]);
        expect(preferences.recentGameIds()).toEqual([]);
    });

    it('removes invalid and duplicate IDs without losing valid preferences', () => {
        values.set('gg-game-navigation-v1', JSON.stringify({ version: 1, favorites: ['genshin', 'invalid/id', 'genshin', 5], recent: ['hsr', null, 'invalid/id', 'hsr'] }));
        const preferences = TestBed.inject(GameNavigationPreferences);
        expect(preferences.favoriteGameIds()).toEqual(['genshin']);
        expect(preferences.recentGameIds()).toEqual(['hsr']);
        preferences.toggleFavorite('invalid/id');
        preferences.remember('invalid/id');
        expect(preferences.favoriteGameIds()).toEqual(['genshin']);
        expect(preferences.recentGameIds()).toEqual(['hsr']);
    });
    it('retains custom game preferences before the registry has loaded', () => {
        values.set('gg-game-navigation-v1', JSON.stringify({ version: 1, favorites: ['custom-rpg'], recent: ['custom-rpg'] }));
        const preferences = TestBed.inject(GameNavigationPreferences);
        expect(preferences.favoriteGameIds()).toEqual(['custom-rpg']);
        expect(preferences.recentGameIds()).toEqual(['custom-rpg']);
    });

    it('keeps preferences usable when storage is unavailable', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => { throw new Error('Blocked'); },
            setItem: () => { throw new Error('Quota'); },
        });
        const preferences = TestBed.inject(GameNavigationPreferences);
        expect(() => { preferences.toggleFavorite('genshin'); preferences.remember('hsr'); }).not.toThrow();
        expect(preferences.favoriteGameIds()).toEqual(['genshin']);
        expect(preferences.recentGameIds()).toEqual(['hsr']);
    });
});
