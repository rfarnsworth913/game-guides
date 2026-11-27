import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DashboardData } from './dashboard-data';
import { AuthStore } from '../../../../core/auth/auth.store';
import { StoryPositionStore } from '../../../gacha/story-guide/state/story-position.store';
import { GuestProgressStorage } from '../../../../core/state/services/guest-progress-storage';
import type { Entry, PlayerState } from '@lib/types/workspace.type';

describe('Dashboard personal event writes', () => {
    const entry: Entry = { id: 'daily', game: 'genshin', kind: 'events', name: 'Daily', notes: '', category: 'daily', completed: false,
        quantity: 0, target: 0, rarity: 1, order: 0, day: '', members: [], requirements: [] };
    beforeEach(() => {const storage = new Map<string, string>(); vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value),
    });});
    afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});
    function setup(signedIn = false, fail = false) {
        let state: Record<string, PlayerState> = {};
        const request = vi.fn(async (path: string, init?: RequestInit) => {
            if (path === '/api/me/progress') {
                if (init?.method === 'PATCH') {
                    if (fail) {return new Response(JSON.stringify({ error: 'Save failed' }), { status: 503 });}
                    state = { ...state, ...(JSON.parse(init.body as string) as { changes: Record<string, PlayerState> }).changes };
                }
                return new Response(JSON.stringify({ revision: 1, state }));
            }
            return new Response(JSON.stringify({ games: [], errors: [], generatedAt: '' }));
        });
        TestBed.configureTestingModule({ providers: [{ provide: AuthStore, useValue: { user: signal(signedIn ? { id: 'alice' } : null), request } },
            { provide: StoryPositionStore, useValue: { positions: signal({}) } }] });
        const data = TestBed.inject(DashboardData);
        data.events.set({ entries: [entry], errors: [] });
        return { data, request };
    }
    it('updates only device progress for a guest and persists canonical state without catalog fields', async () => {
        const { data, request } = setup();
        await data.toggle(entry);
        expect(new GuestProgressStorage().read()['genshin/daily']).toEqual({ completed: true, quantity: 0, target: 0 });
        expect(data.events().entries[0].completed).toBe(true);
        expect(request.mock.calls.every(([path]) => !path.includes('/me/progress') && !path.includes('/catalog'))).toBe(true);
    });
    it('uses the existing account progress transport and preserves completion across a fresh read', async () => {
        const { data, request } = setup(true);
        await data.toggle(entry);
        const patch = request.mock.calls.find(([path, init]) => path === '/api/me/progress' && init?.method === 'PATCH')!;
        expect(JSON.parse(patch[1]!.body as string)).toEqual({ revision: 1, changes: { 'genshin/daily': { completed: true, quantity: 0, target: 0 } } });
        expect(data.events().entries[0].completed).toBe(true);
        expect(new GuestProgressStorage().read()).toEqual({});
    });
    it('leaves completion unchanged and exposes a local retryable error after a failed account write', async () => {
        const { data } = setup(true, true);
        await data.toggle(entry);
        expect(data.events().entries[0].completed).toBe(false);
        expect(data.saveError()).toBe('Save failed');
        expect(data.saving()).toBe(false);
    });
    it('keeps loaded summaries visible while a completion refresh is pending', async () => {
        const { data, request } = setup();
        await data.refreshSummary();
        const summary = data.summary();
        let respond!: (response: Response) => void;
        request.mockImplementationOnce(() => new Promise<Response>(resolve => {respond = resolve;}));
        await data.toggle(entry);
        expect(data.events().entries[0].completed).toBe(true);
        expect(data.summaryLoading()).toBe(false);
        expect(data.eventsLoading()).toBe(false);
        expect(data.summary()).toBe(summary);
        expect(data.saving()).toBe(false);
        respond(new Response(JSON.stringify({ games: [], errors: [], generatedAt: 'refreshed' })));
        await vi.waitFor(() => expect(data.summary().generatedAt).toBe('refreshed'));
        expect(data.summaryLoading()).toBe(false);
    });
    it('still shows initial loading after changing game scope', async () => {
        const { data, request } = setup();
        await data.refreshSummary();
        const pending: (() => void)[] = [];
        request.mockImplementation((path: string) => new Promise<Response>(resolve => {
            pending.push(() => resolve(new Response(JSON.stringify(path.includes('/events') ? { entries: [], errors: [] } : { games: [], errors: [], generatedAt: 'new game' }))));
        }));
        data.load('hsr');
        expect(data.summaryLoading()).toBe(true);
        expect(data.eventsLoading()).toBe(true);
        expect(data.summary().games).toEqual([]);
        pending.forEach(respond => respond());
        await vi.waitFor(() => expect(data.summaryLoading() || data.eventsLoading()).toBe(false));
        expect(data.summary().generatedAt).toBe('new game');
    });
});
