import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DashboardPage } from './dashboard';
import { DashboardData } from '../../state/dashboard-data';
import { WorkspaceStore } from '../../../../../core/state/workspace.store';
import { AuthStore } from '../../../../../core/auth/auth.store';
import { GameNavigationPreferences } from '../../../../../core/state/game-navigation-preferences';
import { emptyGameLibrary } from '@common/workspace/game-library';
import { defaultGameOverview } from '@common/workspace/game-overview';
import type { Entry } from '@lib/types/workspace.type';
import type { DashboardGame, DashboardSummary, DashboardEvents } from '@lib/types/dashboard.type';
import { eventPlanning } from '../../../../gacha/events/utils/event-planning';

describe('Scoped dashboard projections', () => {
    beforeEach(() => {const values = new Map<string, string>(); vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });});
    afterEach(() => vi.unstubAllGlobals());
    function setup() {
        const games = ['genshin', 'hsr', 'endfield', 'ffxiv', 'wuwa'].map(defaultGameOverview);
        const summaries: DashboardGame[] = games.map((game, index) => ({ game, story: { completed: index === 0 ? 1 : 0, total: index === 0 ? 2 : index === 1 ? 8 : 0 },
            progressUpdatedAt: new Date(2026, 10, 26, 12 - index).toISOString(), hasProgress: true, planCount: 0, plans: [], achievements: { total: 0, completed: 0 } }));
        const data = { summary: signal<DashboardSummary>({ games: summaries, errors: [], generatedAt: '' }), events: signal<DashboardEvents>({ entries: [], errors: [] }),
            summaryLoading: signal(false), eventsLoading: signal(false), summaryError: signal(''), eventsError: signal(''), saving: signal(false), saveError: signal(''),
            load: vi.fn(), refreshSummary: vi.fn(), refreshEvents: vi.fn(), toggle: vi.fn() };
        const library = signal(emptyGameLibrary());
        const preferences = { library, pinnedGameIds: signal(['hsr', 'genshin']), recentGameIds: signal(['genshin', 'endfield', 'ffxiv', 'wuwa']) };
        const store = { games: signal(games), canEdit: signal(false), loading: signal(false), initialized: signal(true) };
        TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: WorkspaceStore, useValue: store },
            { provide: AuthStore, useValue: { user: signal(null) } }, { provide: GameNavigationPreferences, useValue: preferences }] });
        TestBed.overrideComponent(DashboardPage, { set: { providers: [{ provide: DashboardData, useValue: data }] } });
        const fixture = TestBed.createComponent(DashboardPage), page = fixture.componentInstance;
        page.now.set(new Date(2026, 10, 26, 12).getTime()); fixture.detectChanges();
        return { fixture, page, data, store, preferences, root: fixture.nativeElement as HTMLElement };
    }
    const event = (id: string, end = '2026-11-27', completed = false): Entry => ({ id, game: 'genshin', kind: 'events', name: id,
        startDate: '2026-11-01', endDate: end, completed, category: 'temporary', eventType: 'temporary', order: 0, quantity: 0, target: 0,
        rarity: 1, day: '', notes: '', members: [], requirements: [] });
    it('uses weighted eligible totals, N/A for empty progress, and a compact statistics bar', () => {
        const { page, data, fixture, root } = setup();
        expect(page.storyProgress()).toEqual({ completed: 1, total: 10 });
        expect(page.stats().find(stat => stat.icon === 'story')?.value).toBe('10%');
        expect(root.querySelectorAll('[aria-label="Workspace summary"]')).toHaveLength(1);
        data.summary.update(value => ({ ...value, games: value.games.map(game => ({ ...game, story: { completed: 0, total: 0 } })) })); fixture.detectChanges();
        expect(page.stats().find(stat => stat.icon === 'story')?.value).toBe('N/A');
        expect(root.querySelector('.worlds-panel,.story-panel,.quick-actions')).toBeNull();
    });
    it('orders actual progress changes newest first and ignores pins and navigation recency', () => {
        const { page, preferences, fixture, root, data } = setup();
        expect(page.continueGames().map(summary => summary.game.gameId)).toEqual(['genshin', 'hsr', 'endfield', 'ffxiv']);
        expect(root.querySelectorAll('.continue-card')).toHaveLength(4);
        preferences.pinnedGameIds.set(['wuwa']); preferences.recentGameIds.set(['wuwa']); fixture.detectChanges();
        expect(page.continueGames()[0].game.gameId).toBe('genshin');
        data.summary.update(value => ({ ...value, games: value.games.map(summary => ({ ...summary, progressUpdatedAt: globalThis.undefined, hasProgress: false })) })); fixture.detectChanges();
        expect(root.textContent).toContain('Games appear here when you update your progress');
    });
    it('does not reload or replace content when focus returns to the browser tab', () => {
        const { data, root, fixture } = setup();
        const card = root.querySelector('.continue-card'); data.load.mockClear();
        window.dispatchEvent(new Event('focus')); fixture.detectChanges();
        expect(data.load).not.toHaveBeenCalled(); expect(data.refreshSummary).not.toHaveBeenCalled(); expect(data.refreshEvents).not.toHaveBeenCalled();
        expect(root.querySelector('.continue-card')).toBe(card);
    });
    it('chooses the last accessible meaningful feature without assuming a story guide', () => {
        const { page, preferences, store } = setup();
        const summary = page.summaries()[0];
        preferences.library.update(library => ({ ...library, games: [{ gameId: summary.game.gameId, isPinned: false, isFavorite: false, lastVisitedFeatureId: 'characters' }] }));
        expect(page.resume(summary).feature).toBe('characters');
        store.games.update(games => games.map(game => game.gameId === summary.game.gameId ? { ...game, features: {} } : game));
        expect(page.resume(summary)).toEqual({ feature: 'dashboard', label: 'Open Game' });
    });
    it('scopes game data and hides disabled/editor-only widgets', () => {
        const { page, fixture, data, store, root } = setup();
        const game = { ...defaultGameOverview('genshin'), features: { events: { feature: 'events' as const, visibility: 'public' as const }, story: { feature: 'story' as const, visibility: 'editors' as const } } };
        store.games.set([game]); fixture.componentRef.setInput('context', game);
        data.events.set({ entries: [event('ours'), { ...event('other'), game: 'hsr' }], errors: [] }); fixture.detectChanges();
        expect(page.events().map(entry => entry.id)).toEqual(['ours']);
        expect(root.querySelector('.continue-story')).toBeNull();
        expect(root.querySelector('.summary-characters')).toBeNull();
        expect(root.querySelector('.events-panel')).not.toBeNull();
        expect(root.textContent).not.toContain('Inventory');
    });
    it('uses actual expiration dates for Ending Soon and excludes completed, expired and upcoming events', () => {
        const { page, data } = setup();
        data.events.set({ entries: [event('later', '2026-11-28'), event('soon', '2026-11-26'), event('done', '2026-11-26', true), event('expired', '2026-11-25'),
            { ...event('upcoming'), startDate: '2026-11-27' }], errors: [] });
        expect(page.endingSoon().map(entry => entry.id)).toEqual(['soon', 'later']);
        page.now.set(new Date(2026, 10, 27).getTime());
        expect(page.endingSoon().some(entry => entry.id === 'soon')).toBe(false);
    });
    it('reuses calendar assignments and keeps completed tasks in place', async () => {
        const { page, fixture, data, root } = setup();
        const entries = [event('one', '2026-12-20'), event('two', '2026-12-20'), event('three', '2026-12-20')];
        localStorage.setItem('gg-event-view-v1:guest:global', JSON.stringify({ version: 1, balanceEnabled: true }));
        const plan = eventPlanning(entries, new Date(page.now()), 'guest', '', {}).resolve();
        data.events.set({ entries, errors: [] }); fixture.detectChanges();
        const expected = entries.filter(entry => plan.assignments['genshin/' + entry.id] === '2026-11-26');
        expect(page.todayTasks().map(entry => entry.id)).toEqual(expected.map(entry => entry.id));
        expect(page.todayTasks().length).toBeLessThan(entries.length);
        const original = [...root.querySelectorAll('.task-row')];
        data.toggle.mockImplementation(async (entry: Entry) => {data.events.update(value => ({ ...value, entries: value.entries.map(item => item.id === entry.id ? { ...item, completed: true } : item) }));});
        root.querySelector<HTMLInputElement>('.dashboard-event-completion')!.click(); await fixture.whenStable(); fixture.detectChanges();
        expect([...root.querySelectorAll('.task-row')]).toEqual(original);
        expect(page.todayCompleted()).toBe(1);
        expect(root.querySelector('.task-row.is-completed')).not.toBeNull();
    });
    it('keeps summary widgets available when event loading fails and exposes a local retry', () => {
        const { root, data, fixture } = setup();
        data.eventsError.set('Calendar unavailable'); fixture.detectChanges();
        expect(root.textContent).toContain('Calendar unavailable');
        expect(root.querySelectorAll('.continue-card')).toHaveLength(4);
        const retry = [...root.querySelectorAll('button')].find(button => button.textContent === 'Retry tasks')!;
        retry.click(); expect(data.refreshEvents).toHaveBeenCalled();
    });
    it('shows independent loading indicators while preserving mounted widget content', () => {
        const { fixture, root, data } = setup();
        const card = root.querySelector('.continue-card');
        data.summaryLoading.set(true); data.eventsLoading.set(true); fixture.detectChanges();
        expect(root.querySelectorAll('.summary-card gg-dashboard-loading').length).toBeGreaterThan(0);
        expect(root.querySelector('#continue-playing .section-body')?.hasAttribute('inert')).toBe(true);
        expect(root.querySelector('.events-panel .loading-layer')?.classList.contains('visible')).toBe(true);
        data.summaryLoading.set(false); fixture.detectChanges();
        expect(root.querySelector('.continue-card')).toBe(card);
        expect(root.querySelector('#continue-playing .section-body')?.hasAttribute('inert')).toBe(false);
        expect(root.querySelector('.events-panel .loading-layer')?.classList.contains('visible')).toBe(true);
        data.eventsLoading.set(false); fixture.detectChanges();
        expect(root.querySelector('.events-panel .loading-layer')?.classList.contains('visible')).toBe(false);
    });
    it('collapses each game independently while retaining rows and current completion counts', () => {
        const { fixture, root, data, page } = setup();
        data.events.set({ entries: [event('one'), event('two', '2026-11-27', true), { ...event('other'), game: 'hsr' }], errors: [] });
        fixture.detectChanges();
        const groups = [...root.querySelectorAll('gg-dashboard-task-group')];
        const group = groups.find(item => item.textContent?.includes('Genshin Impact'))!;
        const toggle = group.querySelector<HTMLButtonElement>('.task-game-toggle')!;
        const rows = [...group.querySelectorAll('.task-row')];
        expect(group.querySelector('.group-count')?.textContent).toContain('1 / 2');
        toggle.click(); fixture.detectChanges();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(group.querySelector('.task-group-collapse')?.hasAttribute('inert')).toBe(true);
        expect(groups.find(item => item !== group)?.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
        data.events.update(value => ({ ...value, entries: value.entries.map(item => item.id === 'one' ? { ...item, completed: true } : item) }));
        fixture.detectChanges();
        expect(group.querySelector('.group-count')?.textContent).toContain('2 / 2');
        toggle.click(); fixture.detectChanges();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(group.querySelector('.task-group-collapse')?.hasAttribute('inert')).toBe(false);
        expect([...group.querySelectorAll('.task-row')]).toEqual(rows);
        expect(page.todayCompleted()).toBe(2);
        expect(data.toggle).not.toHaveBeenCalled();
    });
});
