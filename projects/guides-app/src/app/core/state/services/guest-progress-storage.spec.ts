import { afterEach, describe, expect, it, vi } from 'vitest';
import { GuestProgressStorage } from './guest-progress-storage';

describe('GuestProgressStorage', () => {
    afterEach(() => vi.unstubAllGlobals());
    it('merges unrelated edits from another tab and refuses to overwrite malformed stored data', () => {
        const data = new Map<string, string>();
        vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
        const storage = new GuestProgressStorage();
        const original = { completed: false, quantity: 2, target: 90 };
        const base = { 'genshin/one': original };
        storage.write({ ...base, 'genshin/two': { ...original, quantity: 10 } });
        const merged = storage.merge(base, { 'genshin/one': { ...original, completed: true } });
        storage.write(merged);
        expect(storage.read()).toEqual({ 'genshin/one': { ...original, completed: true }, 'genshin/two': { ...original, quantity: 10 } });
        data.set('gg-player-v1', '{"version":1,"state":{"genshin/one":{"quantity":-1}}}');
        const corrupted = data.get('gg-player-v1');
        expect(() => storage.merge(base, base)).toThrow('not been overwritten');
        expect(data.get('gg-player-v1')).toBe(corrupted);
    });
});
