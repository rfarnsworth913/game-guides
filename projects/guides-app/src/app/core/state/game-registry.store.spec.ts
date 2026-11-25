import { Injector, runInInjectionContext, signal } from '@angular/core';
import { AuthStore } from '../auth/auth.store';
import { WorkspaceStore } from './workspace.store';
import { defaultGameOverview } from '@common/workspace/game-overview';
import type { GameRegistration } from '@lib/types/game-registration.type';

describe('Dynamic game registry in the workspace', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('loads custom games and preserves guest progress through rename and visibility changes', async () => {
        let overview = { ...defaultGameOverview('custom-rpg'), name: 'Custom RPG', features: { events: { feature: 'events', visibility: 'public' } } } as GameRegistration;
        const entries = [{ id: 'event', game: overview.id, kind: 'events', name: 'An event', category: '', notes: '', rarity: 1,
            order: 0, day: '', members: [], requirements: [] }];
        const values = new Map([['gg-player-v1', JSON.stringify({ version: 1, state: {
            'custom-rpg/event': { completed: true, quantity: 0, target: 0 },
        } })]]);
        vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
        const snapshot = () => ({ id: overview.id, name: overview.name, revision: 0, overview, entries });
        const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
            if (url === '/api/games') {return new Response(JSON.stringify({ games: [snapshot()] }));}
            if (url === '/api/games/registry') {return new Response(JSON.stringify({ games: [overview] }));}
            if (url === '/api/games/custom-rpg' && init?.method === 'GET') {return new Response(JSON.stringify(snapshot()));}
            const body = JSON.parse(init?.body as string) as GameRegistration;
            overview = { ...(init?.method === 'DELETE' ? { ...overview, visibility: 'editors' } : body), revision: overview.revision + 1 };
            return new Response(JSON.stringify(overview));
        });
        vi.stubGlobal('fetch', fetcher);
        const store = runInInjectionContext(Injector.create({ providers: [{ provide: AuthStore, useValue: null }] }), () => new WorkspaceStore());
        expect(await store.initialize()).toBe(true);
        expect(store.games().map(game => game.id)).toEqual(['custom-rpg']);
        expect(store.entries()[0].completed).toBe(true);
        const renamed = await store.saveGameOverview({ ...overview, name: 'Renamed Game' });
        expect(store.games()[0].name).toBe('Renamed Game');
        const archived = await store.saveGameOverview(renamed, false, true);
        expect(store.games()[0].visibility).toBe('editors');
        expect(store.entries()[0].completed).toBe(true);
        expect((await store.gameRegistry())[0].visibility).toBe('editors');
        await store.saveGameOverview({ ...archived, visibility: 'public' });
        expect(store.games()[0].id).toBe('custom-rpg');
        expect(store.entries()[0].completed).toBe(true);
        expect(fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
    });

    it('blocks game management in a non-editor session before issuing requests', async () => {
        const request = vi.fn();
        const auth = { user: signal({ editor: false }), request };
        const store = runInInjectionContext(Injector.create({ providers: [{ provide: AuthStore, useValue: auth }] }), () => new WorkspaceStore());
        await expect(store.gameRegistry()).rejects.toThrow('Editor access');
        await expect(store.saveGameOverview(defaultGameOverview('new-game'), true)).rejects.toThrow('Editor access');
        expect(request).not.toHaveBeenCalled();
    });
});
