import { Injector, runInInjectionContext, signal } from '@angular/core';

import { WorkspaceStore, GAMES } from "../../../../core/state/workspace.store";
import { AuthStore } from "../../../../core/auth/auth.store";
import type { CatalogEntry, PlayerState } from "../../../../../../../lib/types/workspace.type";
import { emptyPatchOverview } from "../../../../../../../common/quests/story-template";

const event: CatalogEntry = { id: 'parsed-event-test', game: 'genshin', kind: 'events', name: 'Daily Commissions',
    notes: '', category: 'daily', eventType: 'daily', startDate: '2026-10-29', endDate: '2026-10-29',
    wikiUrl: 'https://example.com/commissions', rarity: 1, members: [], requirements: [], order: 0, day: '' };

describe('Event completion persistence', () => {
    const accounts = new Map<string, Record<string, PlayerState>>();
    const storage = new Map<string, string>();
    const methods: string[] = [];
    let catalog: CatalogEntry[] = [event];
    async function request(account: string, path: string, init?: RequestInit): Promise<Response> {
        methods.push(init?.method ?? 'GET');
        let data: unknown;
        if (path === '/api/games') {
            data = { games: GAMES.map(game => ({ id: game.id, name: game.name, revision: 0, entries: game.id === 'genshin' ? catalog : [] })) };
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
        catalog = [event];
        vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
        vi.stubGlobal('fetch', (path: string, init?: RequestInit) => request('guest', path, init));
    });
    afterEach(() => vi.unstubAllGlobals());
    it('resolves shared event rows and saves guide completion without attempting a catalog write', async () => {
        const shared = { ...event, notes: 'Shared description', eventStory: { ...emptyPatchOverview(), rows: [{ id: 'quest', content: 'Event quest', contentType: '', patch: '1.0', notes: '' }] } };
        catalog = [shared, { ...event, id: 'placement', kind: 'story', category: 'events', eventId: event.id }];
        const alice = runInInjectionContext(Injector.create({ providers: [{ provide: AuthStore, useValue: auth('alice') }] }), () => new WorkspaceStore());
        expect(await alice.initialize()).toBe(true);
        const placement = alice.entries().find(entry => entry.id === 'placement')!;
        expect(placement.eventStory?.summary).toBe('Shared description');
        expect(await alice.save({ ...placement, storyRowCompletion: { quest: true } })).toBe(true);
        expect(await alice.save({ ...alice.entries().find(entry => entry.id === event.id)!, completed: true })).toBe(true);
        expect(methods).not.toContain('PUT');
        expect(accounts.get('alice')?.['genshin/placement']).toBeUndefined();
        expect(accounts.get('alice')?.[`genshin/${event.id}`].storyRowCompletion).toEqual({ quest: true });
        expect(accounts.get('alice')?.[`genshin/${event.id}`].completed).toBe(true);
    });
    it('saves and reloads personal completion without editing catalog data or another account', async () => {
        const alice = runInInjectionContext(Injector.create({ providers: [{ provide: AuthStore, useValue: auth('alice') }] }), () => new WorkspaceStore());
        expect(await alice.initialize()).toBe(true);
        expect(await alice.save({ ...alice.entries()[0], completed: true })).toBe(true);
        const restored = runInInjectionContext(Injector.create({ providers: [{ provide: AuthStore, useValue: auth('alice') }] }), () => new WorkspaceStore());
        await restored.initialize();
        expect(restored.entries()[0].completed).toBe(true);
        expect(restored.entries()[0].startDate).toBe(event.startDate);
        const bob = runInInjectionContext(Injector.create({ providers: [{ provide: AuthStore, useValue: auth('bob') }] }), () => new WorkspaceStore()); await bob.initialize();
        expect(bob.entries()[0].completed).toBe(false);
        expect(methods).not.toContain('PUT');
        expect(methods).toContain('PATCH');
    });
    it('merges legacy guide progress once, shares objective state across views and preserves optional objectives', async () => {
        const row = { content: 'Objective', contentType: '', patch: '', notes: '' };
        const shared = { ...event, eventStory: { ...emptyPatchOverview(), rows: [{ ...row, id: 'first' }, { ...row, id: 'second' }, { ...row, id: 'bonus', optional: true }] } };
        catalog = [shared, { ...event, id: 'placement', kind: 'story', category: 'events', eventId: event.id }];
        accounts.set('alice', { 'genshin/placement': { completed: false, quantity: 0, target: 0, storyRowCompletion: { first: true, bonus: true } } });
        const create = async (account = 'alice') => {
            const store = runInInjectionContext(Injector.create({ providers: [{ provide: AuthStore, useValue: auth(account) }] }), () => new WorkspaceStore());
            await store.initialize(); return store;
        };
        const alice = await create();
        expect(alice.entries().find(entry => entry.kind === 'events')?.storyRowCompletion).toEqual({ first: true, bonus: true });
        expect(await alice.save({ ...alice.entries().find(entry => entry.kind === 'events')!, completed: true })).toBe(true);
        expect(alice.entries().find(entry => entry.id === 'placement')?.completed).toBe(true);
        const restored = await create();
        expect(restored.entries().find(entry => entry.kind === 'events')?.completed).toBe(true);
        const guide = restored.entries().find(entry => entry.id === 'placement')!;
        expect(await restored.save({ ...guide, storyRowCompletion: { ...guide.storyRowCompletion, first: false } })).toBe(true);
        expect(restored.entries().find(entry => entry.kind === 'events')?.completed).toBe(false);
        const refreshed = await create();
        expect(refreshed.entries().find(entry => entry.kind === 'events')?.storyRowCompletion).toEqual({ first: false, second: true, bonus: true });
        expect(await refreshed.save({ ...refreshed.entries().find(entry => entry.kind === 'events')!, completed: true })).toBe(true);
        expect(await refreshed.save({ ...refreshed.entries().find(entry => entry.kind === 'events')!, completed: false })).toBe(true);
        expect(accounts.get('alice')?.[`genshin/${event.id}`].storyRowCompletion).toEqual({ first: false, second: false, bonus: true });
        expect(accounts.get('alice')?.['genshin/placement'].storyRowCompletion?.['first']).toBe(true);
        expect((await create('bob')).entries().every(entry => !entry.completed)).toBe(true);
        expect(methods).not.toContain('PUT');
    });
    it('imports legacy guest event objectives under the canonical ID without duplicating placement progress', async () => {
        const shared = { ...event, eventStory: { ...emptyPatchOverview(), rows: [{ id: 'quest', content: 'Quest', contentType: '', patch: '', notes: '' }] } };
        catalog = [shared, { ...event, id: 'placement', kind: 'story', category: 'events', eventId: event.id }];
        storage.set('gg-player-v1', JSON.stringify({ version: 1, state: { 'genshin/placement': { completed: true, quantity: 0, target: 0, storyRowCompletion: { quest: true } } } }));
        const alice = runInInjectionContext(Injector.create({ providers: [{ provide: AuthStore, useValue: auth('alice') }] }), () => new WorkspaceStore());
        await alice.initialize();
        expect(await alice.importGuestProgress()).toBe(true);
        expect(accounts.get('alice')?.[`genshin/${event.id}`].storyRowCompletion).toEqual({ quest: true });
        expect(accounts.get('alice')?.['genshin/placement']).toBeUndefined();
        expect(alice.entries().every(entry => entry.completed)).toBe(true);
    });
    it('saves guest completion in the existing browser progress record', async () => {
        const guest = runInInjectionContext(Injector.create({ providers: [{ provide: AuthStore, useValue: null }] }), () => new WorkspaceStore()); await guest.initialize();
        expect(await guest.save({ ...guest.entries()[0], completed: true })).toBe(true);
        const restored = runInInjectionContext(Injector.create({ providers: [{ provide: AuthStore, useValue: null }] }), () => new WorkspaceStore()); await restored.initialize();
        expect(restored.entries()[0].completed).toBe(true);
        expect(storage.has('gg-player-v1')).toBe(true);
        expect(methods).not.toContain('PUT');
        expect(methods).not.toContain('PATCH');
    });
});
