import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Events } from "./events";
import { Entry, WorkspaceStore } from "../../../../../core/state/workspace.store";
import { eventDate, eventRange, eventStatus, eventTiming, monthDays, occursBetween, occursOn } from "../../utils/event-calendar";
import { defaultGameOverview } from '@common/workspace/game-overview';
import { emptyPatchOverview } from '@common/quests/story-template';

const event: Entry = { id: 'event', game: 'genshin', kind: 'events', name: 'Snowball Fight',
    notes: '', category: '', rarity: 1, members: [], requirements: [], completed: false,
    order: 0, day: '', quantity: 0, target: 0, eventType: 'temporary',
    startDate: '2026-10-29', endDate: '2026-11-02', wikiUrl: 'https://example.com/event' };

describe('Event tracking', () => {
    const groupsKey = 'gg-events-groups-v1';
    beforeEach(() => {
        const values = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key),
        });
    });
    afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});
    function setup() {
        const entries = signal<Entry[]>([structuredClone(event), { ...event, id: 'daily', name: 'Daily Commissions', eventType: 'daily', startDate: '', endDate: '' }, { ...event, id: 'other-game', game: 'hsr' }]);
        const save = vi.fn(async (entry: Entry) => { entries.update(values => values.map(value => value.id === entry.id ? entry : value)); return true; });
        const store = { entries, save, auth: { user: signal<{ id: string } | null>(null) }, games: signal(['genshin', 'hsr'].map(id => defaultGameOverview(id))), canEdit: signal(false), saving: signal(false), loading: signal(false), initialized: signal(true), error: signal('Save failed') };
        TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: store }] });
        const fixture = TestBed.createComponent(Events);
        fixture.componentRef.setInput('game', 'genshin');
        fixture.detectChanges();
        return { fixture, store, root: (fixture.nativeElement as HTMLElement) as HTMLElement };
    }
    it('restores saved categories on reopening the global calendar and remembers All groups', () => {
        const { fixture } = setup();
        fixture.componentRef.setInput('game', ''); fixture.detectChanges();
        fixture.componentInstance.toggleGroup('daily');
        fixture.componentInstance.toggleGroup('temporary'); fixture.detectChanges();
        expect(JSON.parse(localStorage.getItem('gg-event-view-v1:guest:global')!) as unknown).toMatchObject({ version: 1, groups: ['daily', 'temporary'] });
        fixture.destroy();
        const restored = TestBed.createComponent(Events);
        restored.detectChanges();
        expect(restored.componentInstance.selectedGroups()).toEqual(['daily', 'temporary']);
        restored.componentRef.setInput('game', 'hsr'); restored.detectChanges();
        restored.componentRef.setInput('game', ''); restored.detectChanges();
        expect(restored.componentInstance.selectedGroups()).toEqual(['daily', 'temporary']);
        restored.componentInstance.selectedGroups.set([]); restored.detectChanges();
        restored.destroy();
        const allGroups = TestBed.createComponent(Events); allGroups.detectChanges();
        expect(allGroups.componentInstance.selectedGroups()).toEqual([]);
        expect(allGroups.componentInstance.filtered()).toHaveLength(3);
    });
    it.each(['not-json', '{"version":2,"types":["daily"]}', '{"version":1,"types":[42]}'])('ignores invalid saved categories: %s', raw => {
        localStorage.setItem(groupsKey, raw);
        const { fixture } = setup();
        fixture.componentRef.setInput('game', ''); fixture.detectChanges();
        expect(fixture.componentInstance.selectedGroups()).toEqual([]);
        expect(fixture.componentInstance.filtered()).toHaveLength(3);
    });
    it('restores calendar controls after refresh and keeps account and game settings separate', () => {
        const { fixture, store } = setup();
        fixture.componentRef.setInput('game', ''); fixture.detectChanges();
        const component = fixture.componentInstance;
        component.selectedGame.set('hsr'); component.selectedGroups.set(['temporary']); component.status.set('active'); component.period.set('month');
        component.search.set('Snowball'); component.showCompleted.set(false); component.setBalance(true); component.filtersOpen.set(true);
        component.month.set(new Date(2027, 1, 1)); component.backlogSort.set('completion'); component.compact.set(true); component.setDailyLimit(3);
        fixture.detectChanges(); fixture.destroy();
        const restored = TestBed.createComponent(Events); restored.detectChanges();
        const calendar = restored.componentInstance;
        expect(calendar.selectedGame()).toBe('hsr'); expect(calendar.selectedGroups()).toEqual(['temporary']);
        expect(calendar.status()).toBe('active'); expect(calendar.period()).toBe('month'); expect(calendar.search()).toBe('Snowball');
        expect(calendar.showCompleted()).toBe(false); expect(calendar.balanceEnabled()).toBe(true); expect(calendar.filtersOpen()).toBe(true);
        expect(calendar.view()).toBe('calendar'); expect(calendar.month()).toEqual(new Date(2027, 1, 1)); expect(calendar.backlogSort()).toBe('completion');
        expect(calendar.compact()).toBe(true); expect(calendar.maxPerDay()).toBe(3);
        restored.componentRef.setInput('game', 'genshin'); restored.detectChanges();
        expect(calendar.search()).toBe(''); expect(calendar.view()).toBe('list');
        calendar.type.set('daily'); calendar.view.set('calendar'); restored.detectChanges();
        restored.componentRef.setInput('game', ''); restored.detectChanges();
        expect(calendar.search()).toBe('Snowball'); expect(calendar.selectedGame()).toBe('hsr');
        store.auth.user.set({ id: 'alice' }); restored.detectChanges();
        expect(calendar.search()).toBe(''); expect(calendar.balanceEnabled()).toBe(false); expect(calendar.compact()).toBe(false);
        calendar.search.set('Alice only'); restored.detectChanges();
        store.auth.user.set(null); restored.detectChanges();
        expect(calendar.search()).toBe('Snowball'); expect(calendar.balanceEnabled()).toBe(true); expect(calendar.compact()).toBe(true);
        restored.componentRef.setInput('game', 'genshin'); restored.detectChanges();
        expect(calendar.type()).toBe('daily'); expect(calendar.view()).toBe('calendar');
    });
    it('validates stored settings and imports legacy group preferences', () => {
        localStorage.setItem(groupsKey, JSON.stringify({ version: 1, types: ['daily'] }));
        localStorage.setItem('gg-event-view-v1:guest:global', JSON.stringify({ version: 1, view: 'unknown', groups: [42], status: 'invalid', period: 'invalid', month: '2026-13', showCompleted: 'false', balanceEnabled: 'true', search: 'Valid search' }));
        const { fixture } = setup(); fixture.componentRef.setInput('game', ''); fixture.detectChanges();
        const component = fixture.componentInstance;
        expect(component.view()).toBe('calendar'); expect(component.selectedGroups()).toEqual(['daily']);
        expect(component.status()).toBe('all'); expect(component.period()).toBe('all');
        expect(component.showCompleted()).toBe(true); expect(component.balanceEnabled()).toBe(false); expect(component.search()).toBe('Valid search');
        fixture.destroy(); localStorage.setItem('gg-event-view-v1:guest:global', 'invalid json');
        const restored = TestBed.createComponent(Events); restored.detectChanges();
        expect(restored.componentInstance.search()).toBe('');
        expect(restored.componentInstance.selectedGroups()).toEqual(['daily']);
    });
    it('keeps filtering usable when browser storage is blocked', () => {
        vi.spyOn(localStorage, 'getItem').mockImplementation(() => {throw new Error('Blocked');});
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => {throw new Error('Blocked');});
        const { fixture } = setup();
        fixture.componentRef.setInput('game', ''); fixture.detectChanges();
        fixture.componentInstance.toggleGroup('daily'); fixture.detectChanges();
        expect(fixture.componentInstance.filtered().map(entry => entry.id)).toEqual(['daily']);
    });
    it('groups events by game and keeps completion in place while sorting availability and deadlines', async () => {
        const { fixture, store, root } = setup();
        const component = fixture.componentInstance;
        component.now.set(new Date(2026, 9, 29, 12).getTime());
        const make = (id: string, startDate: string, endDate: string, completed = false): Entry => ({ ...event, id, name: id, startDate, endDate, completed });
        store.entries.set([
            make('ended-old', '2026-10-01', '2026-10-10'), make('upcoming-later', '2026-11-10', '2026-11-20'),
            make('active-later', '2026-10-01', '2026-11-08'), make('unknown', '', ''), make('completed-ended', '2026-10-01', '2026-10-15', true),
            make('upcoming-sooner', '2026-11-01', '2026-11-30'), make('active-urgent', '2026-10-01', '2026-10-29'),
            make('ended-recent', '2026-10-01', '2026-10-28'), make('completed-active', '2026-10-01', '2026-11-01', true),
        ]); fixture.detectChanges();
        expect(component.listGroups().map(group => [group.id, group.entries.map(entry => entry.id)])).toEqual([
            ['genshin', ['active-urgent', 'completed-active', 'active-later', 'upcoming-sooner', 'upcoming-later', 'unknown', 'ended-recent', 'completed-ended', 'ended-old']],
        ]);
        expect(root.querySelector<HTMLDetailsElement>('[data-group="genshin"]')!.open).toBe(true);
        expect(root.textContent).toContain('Unknown availability');
        const before = [...root.querySelectorAll('.event-row')];
        await component.toggle(store.entries().find(entry => entry.id === 'active-urgent')!); fixture.detectChanges();
        [...root.querySelectorAll('.event-row')].forEach((row, index) => expect(row).toBe(before[index]));
        expect(before[0].classList.contains('is-completed')).toBe(true);
        expect(component.listGroups()[0].completed).toBe(3);
        await component.toggle(store.entries().find(entry => entry.id === 'active-urgent')!); fixture.detectChanges();
        component.showCompleted.set(false); fixture.detectChanges();
        expect(component.listGroups().map(group => group.id)).toEqual(['genshin']);
        component.search.set('ended-recent'); fixture.detectChanges();
        expect(component.listGroups()[0].entries.map(entry => entry.id)).toEqual(['ended-recent']);
        component.search.set(''); component.status.set('active'); fixture.detectChanges();
        expect(component.listGroups()[0].entries.map(entry => entry.id)).toEqual(['active-urgent', 'active-later']);
    });
    it('shows game groups, a range summary, multi-select type counts and the next real deadlines', () => {
        const { fixture, store, root } = setup();
        fixture.componentRef.setInput('game', ''); fixture.detectChanges();
        const component = fixture.componentInstance;
        component.view.set('list'); component.now.set(new Date(2026, 9, 29, 12).getTime()); component.selectPeriod('today');
        store.entries.set([event, { ...event, id: 'daily', name: 'Daily Training', game: 'hsr', eventType: 'daily', endDate: '2026-10-29' }]);
        fixture.detectChanges();
        expect(component.listGroups().map(group => group.id)).toEqual(['genshin', 'hsr']);
        expect(root.querySelector('.event-list-overview')?.textContent).toContain("Today's Items");
        expect(component.listStats()).toEqual({ total: 2, completed: 0, remaining: 2, overdue: 0, percent: 0 });
        expect(component.nextDeadlines().map(entry => entry.id)).toEqual(['daily', 'event']);
        const sidebar = root.querySelector('.event-type-options')!;
        const daily = sidebar.querySelector<HTMLInputElement>('input')!;
        daily.click(); fixture.detectChanges();
        expect(component.filtered().map(entry => entry.id)).toEqual(['event']);
        expect(component.typeCounts().map(item => item.count)).toEqual([1, 1]);
        sidebar.querySelectorAll<HTMLInputElement>('input')[1].click(); fixture.detectChanges();
        expect(component.filtered()).toEqual([]);
        sidebar.querySelectorAll<HTMLInputElement>('input')[0].click(); fixture.detectChanges();
        expect(component.filtered().map(entry => entry.id)).toEqual(['daily']);
        component.selectedGroups.set([]); component.listSort.set('deadline'); component.collapseGroups(); fixture.detectChanges();
        expect(component.listGroups().map(group => group.id)).toEqual(['hsr', 'genshin']);
        expect([...root.querySelectorAll<HTMLDetailsElement>('.event-list-group')].every(group => !group.open)).toBe(true);
        component.expandGroups(); fixture.detectChanges();
        expect([...root.querySelectorAll<HTMLDetailsElement>('.event-list-group')].every(group => group.open)).toBe(true);
        expect(JSON.parse(localStorage.getItem('gg-event-view-v1:guest:global')!) as unknown).toMatchObject({ listSort: 'deadline', collapsedGroups: [] });
        component.collapseGroups(); fixture.detectChanges(); fixture.destroy();
        const restored = TestBed.createComponent(Events); restored.detectChanges();
        expect(restored.componentInstance.listSort()).toBe('deadline');
        expect(restored.componentInstance.collapsedGroups().slice().sort()).toEqual(['genshin', 'hsr']);
        const restoredRoot = restored.nativeElement as HTMLElement;
        expect([...restoredRoot.querySelectorAll<HTMLDetailsElement>('.event-list-group')].every(group => !group.open)).toBe(true);
    });
    it('provides interactive summary counts without rebalancing completion or consuming capacity for completed tasks', async () => {
        const { fixture, store, root } = setup();
        const component = fixture.componentInstance;
        component.now.set(new Date(2026, 9, 29, 12).getTime()); component.month.set(new Date(2026, 9, 1));
        component.view.set('calendar'); component.setBalance(true); fixture.detectChanges();
        const plan = structuredClone(component.balancePlan().assignments);
        expect(component.scheduledCount()).toBe(1); expect(component.remainingCount()).toBe(1); expect(component.backlog()).toHaveLength(1);
        await component.toggle(event); fixture.detectChanges();
        expect(component.balancePlan().assignments).toEqual(plan); expect(component.scheduledCount()).toBe(1); expect(component.remainingCount()).toBe(0); expect(component.completedCount()).toBe(1);
        const cards = root.querySelectorAll<HTMLButtonElement>('.event-summary-stats > button');
        cards[2].click(); fixture.detectChanges();
        expect(component.view()).toBe('list'); expect(component.filtered().map(entry => entry.id)).toEqual(['event']);
        expect(root.querySelector<HTMLDetailsElement>('[data-group="genshin"]')!.open).toBe(true);
        root.querySelector<HTMLButtonElement>('.events-backlog-button')!.click(); fixture.detectChanges(); expect(component.backlogOpen()).toBe(true); component.backlogOpen.set(false); fixture.detectChanges();
        root.querySelector<HTMLButtonElement>('.event-list-tools button')!.click(); fixture.detectChanges(); expect(component.settingsOpen()).toBe(true);
        expect(root.querySelector('#events-secondary-filters input[aria-label="Maximum tasks per day"]')).toBeNull();
        expect(root.querySelector('#events-scheduling-settings input[aria-label="Maximum tasks per day"]')).not.toBeNull();
        component.showSummary('scheduled'); fixture.detectChanges(); expect(component.filtered().map(entry => entry.id)).toEqual(['event']);
        component.summaryFilter.set('all'); await component.toggle(store.entries()[0]); fixture.detectChanges();
        expect(component.remainingCount()).toBe(1); expect(component.balancePlan().assignments).toEqual(plan);
    });
    it('protects partial progress on cancellation and failure and allows recording ended events', async () => {
        const { fixture, store, root } = setup();
        const row = { content: 'Objective', contentType: '', patch: '', notes: '' };
        const partial: Entry = { ...event, eventStory: { ...emptyPatchOverview(), rows: [{ ...row, id: 'one' }, { ...row, id: 'two' }, { ...row, id: 'bonus', optional: true }] }, storyRowCompletion: { one: true, bonus: true } };
        store.entries.set([partial]); fixture.componentInstance.now.set(new Date(2026, 11, 1).getTime()); fixture.detectChanges();
        const checkbox = root.querySelector<HTMLInputElement>('.event-completion input')!;
        expect(checkbox.indeterminate).toBe(true); expect(fixture.componentInstance.listGroups()[0].id).toBe('genshin');
        const bubbled = vi.fn(); root.addEventListener('click', bubbled);
        checkbox.click(); fixture.detectChanges(); expect(bubbled).not.toHaveBeenCalled();
        expect(store.save).not.toHaveBeenCalled();
        const cancel = [...root.querySelectorAll<HTMLButtonElement>('.event-confirm-actions button')].find(button => button.textContent === 'Cancel')!;
        cancel.click(); fixture.detectChanges(); expect(store.entries()[0].storyRowCompletion).toEqual({ one: true, bonus: true });
        await fixture.componentInstance.toggle(partial); store.save.mockResolvedValueOnce(false);
        await fixture.componentInstance.confirmCompletion(); fixture.detectChanges();
        expect(store.entries()[0].storyRowCompletion).toEqual({ one: true, bonus: true }); expect(checkbox.checked).toBe(false);
        await fixture.componentInstance.toggle(partial); await fixture.componentInstance.confirmCompletion(); fixture.detectChanges();
        expect(store.entries()[0].storyRowCompletion).toEqual({ one: true, two: true, bonus: true });
        expect(fixture.componentInstance.listGroups()[0].completed).toBe(1);
    });
    it('limits overflow actions to editors and closes menus on outside click and Escape', () => {
        const { fixture, store, root } = setup();
        expect(root.querySelector('.event-admin-actions')).toBeNull(); store.canEdit.set(true); fixture.detectChanges();
        const actions = root.querySelector('summary[aria-label="Actions for Snowball Fight"]')!.closest('details')!;
        actions.open = true; document.body.click(); expect(actions.open).toBe(false);
        actions.open = true; actions.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); expect(actions.open).toBe(false);
        const edit = vi.fn(); fixture.componentInstance.edit.subscribe(edit);
        actions.querySelector<HTMLButtonElement>('button')!.click(); expect(edit).toHaveBeenCalledWith(expect.objectContaining({ id: event.id }));
        expect(actions.open).toBe(false);
    });
    it('shows scoped database events, opens their links and persists completion separately', async () => {
        const { fixture, store, root } = setup();
        expect(root.querySelectorAll('.event-row')).toHaveLength(2);
        const link = root.querySelector<HTMLAnchorElement>('.event-body')!;
        expect(link.href).toBe('https://example.com/event');
        expect(link.target).toBe('_blank');
        expect(link.rel).toBe('noopener noreferrer');
        expect(link.querySelector('input')).toBeNull();
        await fixture.componentInstance.toggle(event);
        fixture.detectChanges();
        expect(store.save).toHaveBeenCalledWith({ ...event, completed: true });
        expect(root.querySelector<HTMLInputElement>('input[aria-label="Mark Snowball Fight incomplete"]')!.checked).toBe(true);
        await fixture.componentInstance.toggle(store.entries()[0]);
        expect(store.entries()[0].completed).toBe(false);
    });
    it('opens the global calendar across enabled games and shares game filtering between views', async () => {
        const { fixture, store, root } = setup();
        fixture.componentRef.setInput('game', ''); fixture.detectChanges();
        const component = fixture.componentInstance;
        component.month.set(new Date(2026, 9, 1)); fixture.detectChanges();
        expect(component.view()).toBe('calendar');
        expect(component.entries()).toHaveLength(3);
        expect(root.querySelectorAll('.calendar-event')).toHaveLength(10);
        expect(root.querySelector('.calendar-event .event-game-badge')?.getAttribute('aria-label')).toBe('Genshin Impact');
        component.backlogOpen.set(true); fixture.detectChanges();
        expect(root.querySelector('.event-backlog .event-game-badge')?.textContent).toBe('GI');
        component.backlogOpen.set(false); fixture.detectChanges();
        component.selectedGame.set('hsr'); fixture.detectChanges();
        expect(root.querySelectorAll('.calendar-event')).toHaveLength(5);
        component.view.set('list'); fixture.detectChanges();
        expect(root.querySelectorAll('.event-row')).toHaveLength(1);
        expect(root.querySelector('.event-game-badge')?.textContent).toBe('HSR');
        await component.toggle(store.entries().find(entry => entry.game === 'hsr')!);
        expect(store.entries().find(entry => entry.game === 'genshin')?.completed).toBe(false);
        expect(store.entries().find(entry => entry.game === 'hsr')?.completed).toBe(true);
        store.games.update(games => games.map(game => game.id === 'hsr' ? { ...game, features: game.features.filter(feature => feature !== 'events') } : game));
        fixture.detectChanges();
        expect(component.entries().every(entry => entry.game === 'genshin')).toBe(true);
        fixture.componentRef.setInput('game', 'genshin'); fixture.detectChanges();
        expect(component.selectedGame()).toBe('');
        expect(root.querySelector('[aria-label="Filter events by game"]')).toBeNull();
    });
    it('shares type, search and completed filters between list and calendar views', async () => {
        const { fixture, root } = setup();
        const component = fixture.componentInstance;
        component.type.set('temporary'); fixture.detectChanges();
        expect(root.querySelectorAll('.event-row')).toHaveLength(1);
        component.view.set('calendar'); component.month.set(new Date(2026, 9, 1)); fixture.detectChanges();
        expect(root.querySelectorAll('.calendar-event')).toHaveLength(5);
        expect(root.querySelectorAll('.event-calendar td')).toHaveLength(42);
        component.search.set('missing'); fixture.detectChanges();
        expect(root.querySelectorAll('.calendar-event')).toHaveLength(0);
        expect(root.textContent).toContain('No matching events');
        component.search.set(''); await component.toggle(event); component.showCompleted.set(false); fixture.detectChanges();
        expect(root.querySelectorAll('.calendar-event')).toHaveLength(0);
    });
    it('combines multiple global event groups and keeps the dropdown open until dismissed', () => {
        const { fixture, root } = setup();
        fixture.componentRef.setInput('game', ''); fixture.detectChanges();
        const component = fixture.componentInstance;
        component.month.set(new Date(2026, 9, 1)); fixture.detectChanges();
        const picker = root.querySelector<HTMLDetailsElement>('details.event-type-filter')!;
        const options = [...picker.querySelectorAll<HTMLLabelElement>('.dropdown-item')];
        const input = (name: string) => options.find(option => option.textContent?.trim() === name)!.querySelector<HTMLInputElement>('input')!;
        picker.open = true;
        input('Daily').click(); fixture.detectChanges();
        expect(component.selectedGroups()).toEqual(['daily']);
        expect(root.querySelectorAll('.calendar-event')).toHaveLength(0);
        expect(component.backlog().map(entry => entry.id)).toContain('daily');
        expect(picker.open).toBe(true);
        input('Limited-time').click(); fixture.detectChanges();
        expect(component.selectedGroups()).toEqual(['daily', 'temporary']);
        expect(root.querySelectorAll('.calendar-event')).toHaveLength(10);
        component.view.set('list'); component.selectedGame.set('hsr'); fixture.detectChanges();
        expect(root.querySelectorAll('.event-row')).toHaveLength(1);
        input('Limited-time').click(); fixture.detectChanges();
        expect(root.querySelectorAll('.event-row')).toHaveLength(0);
        input('All groups').click(); fixture.detectChanges();
        expect(component.selectedGroups()).toEqual([]);
        expect(root.querySelectorAll('.event-row')).toHaveLength(1);
        document.body.click();
        expect(picker.open).toBe(false);
        picker.open = true;
        picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(picker.open).toBe(false);
        expect(root.querySelector('.event-type-tabs')).toBeNull();
    });
    it('hides expired events or shows only active events in both views and responds as time advances', () => {
        const { fixture, store, root } = setup();
        const component = fixture.componentInstance;
        fixture.componentRef.setInput('game', ''); fixture.detectChanges();
        store.entries.set([
            event,
            { ...event, id: 'expired', startDate: '2026-10-27', endDate: '2026-10-28' },
            { ...event, id: 'upcoming', startDate: '2026-11-03', endDate: '2026-11-08' },
            { ...event, id: 'unknown', startDate: '', endDate: '' },
            { ...event, id: 'permanent', startDate: '', endDate: '', eventType: 'permanent' },
        ]);
        component.now.set(new Date(2026, 9, 29, 12).getTime());
        component.month.set(new Date(2026, 9, 1));
        component.status.set('not-expired'); fixture.detectChanges();
        expect(component.filtered().map(entry => entry.id)).not.toContain('expired');
        expect(component.filtered()).toHaveLength(4);
        component.status.set('active'); fixture.detectChanges();
        expect(component.filtered().map(entry => entry.id)).toEqual(['event', 'permanent']);
        expect(component.backlog().some(entry => entry.id === 'permanent')).toBe(true);
        component.view.set('list'); fixture.detectChanges();
        expect(root.querySelectorAll('.event-row')).toHaveLength(2);
        expect(root.querySelector('[aria-label="Filter events by status"]')).not.toBeNull();
        component.selectedGroups.set(['temporary']); component.search.set('missing'); fixture.detectChanges();
        expect(component.filtered()).toHaveLength(0);
        component.search.set(''); component.selectedGroups.set([]);
        component.now.set(new Date(2026, 10, 3, 12).getTime()); fixture.detectChanges();
        expect(component.filtered().map(entry => entry.id)).toEqual(['upcoming', 'permanent']);
        component.status.set('all'); fixture.detectChanges();
        expect(component.filtered()).toHaveLength(5);
    });
    it('filters overlapping periods in both views, clips calendar spillover and jumps to the selected month', () => {
        const { fixture, root } = setup();
        fixture.componentRef.setInput('game', ''); fixture.detectChanges();
        const component = fixture.componentInstance;
        component.now.set(new Date(2026, 9, 29, 12).getTime());
        component.month.set(new Date(2025, 2, 1));
        component.selectPeriod('month'); fixture.detectChanges();
        expect(component.month().getFullYear()).toBe(2026);
        expect(component.month().getMonth()).toBe(9);
        expect(component.filtered()).toHaveLength(2);
        expect(root.querySelectorAll('.calendar-event')).toHaveLength(6);
        expect(root.querySelector('.undated-title')).toBeNull();
        expect(root.querySelector('[aria-label="Filter events by date range"]')).not.toBeNull();
        component.selectPeriod('week'); fixture.detectChanges();
        expect(root.querySelectorAll('.calendar-event')).toHaveLength(8);
        component.selectPeriod('today'); fixture.detectChanges();
        expect(root.querySelectorAll('.calendar-event')).toHaveLength(2);
        component.selectPeriod('next-month'); fixture.detectChanges();
        expect(component.month().getMonth()).toBe(10);
        expect(root.querySelectorAll('.calendar-event')).toHaveLength(4);
        component.view.set('list'); component.selectedGame.set('hsr'); component.selectedGroups.set(['temporary']); component.status.set('active'); fixture.detectChanges();
        expect(root.querySelectorAll('.event-row')).toHaveLength(1);
        component.search.set('missing'); fixture.detectChanges();
        expect(component.filtered()).toHaveLength(0);
        component.search.set(''); component.selectedGame.set(''); component.selectedGroups.set([]); component.status.set('all'); component.selectPeriod('all'); fixture.detectChanges();
        expect(component.filtered()).toHaveLength(3);
    });
    it('shows balanced events once and preserves assignments when a task is completed', async () => {
        const { fixture, store, root } = setup();
        fixture.componentRef.setInput('game', ''); fixture.detectChanges();
        const component = fixture.componentInstance;
        component.now.set(new Date(2026, 9, 29, 12).getTime());
        component.month.set(new Date(2026, 9, 1));
        component.setBalance(true); fixture.detectChanges();
        expect(root.querySelectorAll('.calendar-event')).toHaveLength(2);
        expect(component.balancePlan().dailyLimit).toBe(1);
        expect(component.unscheduled().map(entry => entry.id)).toEqual(['daily']);
        const assignments = { ...component.balancePlan().assignments };
        await component.toggle(store.entries().find(entry => entry.id === 'event')!); fixture.detectChanges();
        expect(component.balancePlan().assignments).toEqual(assignments);
        component.showCompleted.set(false); fixture.detectChanges();
        expect(root.querySelectorAll('.calendar-event')).toHaveLength(1);
        expect(component.balancePlan().assignments).toEqual(assignments);
        component.backlogOpen.set(true); fixture.detectChanges();
        expect(root.querySelector('.event-list')?.textContent).toContain('Daily Commissions');
        component.rebalance(); fixture.detectChanges();
        expect(Object.keys(component.balancePlan().assignments)).toHaveLength(1);
        component.setBalance(false); fixture.detectChanges();
        expect(root.querySelectorAll('.calendar-event')).toHaveLength(5);
    });
    it('uses one wider balanced plan for Today, List, Calendar and presentation filters', () => {
        const { fixture, store, root } = setup();
        fixture.componentRef.setInput('game', ''); fixture.detectChanges();
        const component = fixture.componentInstance;
        component.now.set(new Date(2026, 9, 29, 12).getTime()); component.month.set(new Date(2026, 9, 1));
        store.entries.set(Array.from({ length: 6 }, (_, index) => ({ ...event, id: 'task-' + index, name: 'Task ' + index, endDate: '2026-11-01' })));
        component.view.set('list'); component.selectPeriod('today'); fixture.detectChanges();
        root.querySelector<HTMLInputElement>('.event-list-planning input')!.click(); fixture.detectChanges();
        expect(component.view()).toBe('list');
        const plan = structuredClone(component.balancePlan().assignments);
        expect(Object.keys(plan)).toHaveLength(6);
        expect(new Set(Object.values(plan)).size).toBeGreaterThan(1);
        const todayKeys = Object.keys(plan).filter(key => plan[key] === '2026-10-29').sort();
        expect(component.filtered().map(entry => component.eventKey(entry)).sort()).toEqual(todayKeys);
        expect(component.listStats().total).toBe(todayKeys.length);
        expect(component.listStats().total).toBeLessThan(6);
        component.view.set('calendar'); fixture.detectChanges();
        expect(component.days().find(day => day.key === '2026-10-29')!.events.map(entry => component.eventKey(entry)).sort()).toEqual(todayKeys);
        component.view.set('list'); component.selectPeriod('week'); fixture.detectChanges();
        expect(component.balancePlan().assignments).toEqual(plan);
        component.selectPeriod('all'); component.search.set('Task 2'); fixture.detectChanges();
        expect(component.filtered().map(entry => entry.id)).toEqual(['task-2']);
        expect(component.balancePlan().assignments).toEqual(plan);
        component.search.set(''); component.selectedGame.set('hsr'); fixture.detectChanges();
        expect(component.filtered()).toEqual([]); expect(component.balancePlan().assignments).toEqual(plan);
    });
    it('restores the same balanced assignments after completion and refresh', async () => {
        const { fixture, store, root } = setup();
        const component = fixture.componentInstance;
        component.now.set(new Date(2026, 9, 29, 12).getTime()); component.selectPeriod('today');
        store.entries.set(Array.from({ length: 4 }, (_, index) => ({ ...event, id: 'task-' + index, name: 'Task ' + index })));
        component.setBalance(true); fixture.detectChanges();
        const plan = structuredClone(component.balancePlan().assignments);
        const firstRow = root.querySelector('.event-groups .event-row');
        const entry = component.filtered()[0];
        await component.toggle(entry); fixture.detectChanges();
        expect(root.querySelector('.event-groups .event-row')).toBe(firstRow);
        expect(component.balancePlan().assignments).toEqual(plan);
        fixture.destroy();
        const restored = TestBed.createComponent(Events); restored.componentRef.setInput('game', 'genshin');
        restored.componentInstance.now.set(new Date(2026, 9, 29, 12).getTime()); restored.detectChanges();
        expect(restored.componentInstance.view()).toBe('list'); expect(restored.componentInstance.balanceEnabled()).toBe(true);
        expect(restored.componentInstance.balancePlan().assignments).toEqual(plan);
        expect(restored.componentInstance.filtered().find(item => item.id === entry.id)?.completed).toBe(true);
        restored.componentInstance.setDailyLimit(2); restored.detectChanges();
        expect(restored.componentInstance.balancePlan().dailyLimit).toBe(2);
    });
    it('pins from Backlog and row scheduling in List without narrowing the planning window to Today', () => {
        const { fixture, store, root } = setup();
        const component = fixture.componentInstance;
        component.now.set(new Date(2026, 9, 29, 12).getTime()); component.selectPeriod('today');
        store.entries.set([{ ...event, startDate: '', endDate: '' }]);
        component.setBalance(true); fixture.detectChanges();
        expect(component.filtered()).toEqual([]); expect(component.backlog()).toHaveLength(1);
        component.setPinDraft(store.entries()[0], '2026-10-30'); component.pinEvent(store.entries()[0]); fixture.detectChanges();
        expect(component.error()).toBe(''); expect(component.view()).toBe('list');
        expect(component.backlog()).toHaveLength(0); expect(component.filtered()).toEqual([]);
        component.selectPeriod('all'); fixture.detectChanges();
        const menu = root.querySelector<HTMLDetailsElement>('.event-schedule-actions')!;
        menu.open = true; fixture.detectChanges();
        const input = menu.querySelector<HTMLInputElement>('input[type=date]')!;
        input.value = '2026-10-31'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
        menu.querySelector<HTMLButtonElement>('button')!.click(); fixture.detectChanges();
        expect(component.plannedDate(store.entries()[0])).toBe('2026-10-31');
        expect(component.view()).toBe('list'); expect(store.save).not.toHaveBeenCalled();
        expect(store.entries()[0].startDate).toBe(''); expect(store.entries()[0].endDate).toBe('');
        document.body.click(); expect(menu.open).toBe(false);
        component.unpin(store.entries()[0]); fixture.detectChanges(); expect(component.backlog()).toHaveLength(1);
    });
    it('keeps undated events accessible and blocks unsafe URLs', () => {
        const { fixture, root } = setup();
        fixture.componentInstance.view.set('calendar'); fixture.componentInstance.backlogOpen.set(true); fixture.detectChanges();
        expect(root.querySelector('.event-list')?.textContent).toContain('Daily Commissions');
        expect(fixture.componentInstance.url({ ...event, wikiUrl: 'data:text/html,invalid' })).toBeNull();
        expect(fixture.componentInstance.url({ ...event, wikiUrl: '' })).toBeNull();
    });
    it('retains completion when saving fails and disables saving while busy', async () => {
        const { fixture, store, root } = setup();
        store.save.mockResolvedValueOnce(false);
        await fixture.componentInstance.toggle(event); fixture.detectChanges();
        expect(root.querySelector('[role="alert"]')?.textContent).toContain('Save failed');
        expect(store.entries()[0].completed).toBe(false);
        store.saving.set(true); fixture.detectChanges();
        expect(root.querySelector<HTMLInputElement>('.event-completion input')!.disabled).toBe(true);
    });
    it('confirms bulk objective changes, updates optimistically and rolls back failed saves', async () => {
        const { fixture, store, root } = setup();
        const entry = { ...event, storyRowCompletion: { first: true, bonus: true }, eventStory: { imageUrl: '', imageAlt: '', sourceName: '', sourceUrl: '', rows: [
            { id: 'first', content: 'First', contentType: '', patch: '', notes: '' }, { id: 'second', content: 'Second', contentType: '', patch: '', notes: '' },
            { id: 'bonus', content: 'Bonus', contentType: '', patch: '', notes: '', optional: true },
        ] } };
        store.entries.set([entry]); fixture.detectChanges();
        const component = fixture.componentInstance;
        await component.toggle(entry); fixture.detectChanges();
        expect(store.save).not.toHaveBeenCalled();
        expect(root.querySelector('[role=dialog]')?.textContent).toContain('Optional objectives stay unchanged');
        let release!: () => void;
        store.save.mockImplementationOnce(async next => {await new Promise<void>(resolve => {release = resolve;}); store.entries.set([next]); return true;});
        const saved = component.confirmCompletion(); fixture.detectChanges();
        expect(root.querySelector<HTMLInputElement>('.event-completion input')!.checked).toBe(true);
        release(); await saved; fixture.detectChanges();
        expect(store.entries()[0].storyRowCompletion).toEqual({ first: true, second: true, bonus: true });
        expect(component.progress(store.entries()[0]).completed).toBe(2);
        store.save.mockResolvedValueOnce(false);
        await component.toggle(store.entries()[0]); await component.confirmCompletion(); fixture.detectChanges();
        expect(root.querySelector<HTMLInputElement>('.event-completion input')!.checked).toBe(true);
        expect(root.querySelector('[role=alert]')?.textContent).toContain('Save failed');
    });
    it('opens day details and pins backlog events without changing source dates', () => {
        const { fixture, store, root } = setup();
        store.entries.set([{ ...event, id: 'undated', startDate: '', endDate: '' }]);
        const component = fixture.componentInstance;
        component.now.set(new Date(2026, 9, 29, 12).getTime()); component.month.set(new Date(2026, 9, 1));
        component.setBalance(true); component.backlogOpen.set(true); fixture.detectChanges();
        expect(root.querySelector('.event-backlog')?.textContent).toContain('A valid deadline');
        component.setPinDraft(store.entries()[0], '2026-10-30'); component.pinEvent(store.entries()[0]); fixture.detectChanges();
        expect(component.plannedDate(store.entries()[0])).toBe('2026-10-30');
        expect(component.backlog()).toHaveLength(0);
        expect(store.entries()[0].startDate).toBe('');
        expect(store.save).not.toHaveBeenCalled();
        component.rebalance(); fixture.detectChanges();
        expect(component.plannedDate(store.entries()[0])).toBe('2026-10-30');
        component.backlogOpen.set(false); component.selectedDay.set('2026-10-30'); fixture.detectChanges();
        expect(root.querySelector('.event-day-dialog')?.textContent).toContain('Snowball Fight');
        expect(localStorage.getItem('gg-event-schedule-v1:guest')).toContain('2026-10-30');
        component.setDailyLimit(0); expect(component.error()).toContain('Daily limit');
        component.setDailyLimit(2); component.compact.set(true); fixture.detectChanges();
        expect(root.querySelector('.events-tracker')?.classList.contains('compact-calendar')).toBe(true);
        component.unpin(store.entries()[0]); fixture.detectChanges();
        expect(component.backlog()).toHaveLength(1);
    });
});

describe('Event calendar dates', () => {
    it('uses Monday weeks, calendar month/year boundaries and inclusive date-only event ends', () => {
        const now = new Date(2026, 10, 17, 12);
        expect(eventRange('all', now)).toBeNull();
        expect(eventRange('today', now)).toEqual({ start: new Date(2026, 10, 17), end: new Date(2026, 10, 18) });
        expect(eventRange('week', now)).toEqual({ start: new Date(2026, 10, 16), end: new Date(2026, 10, 23) });
        expect(eventRange('next-7-days', now)).toEqual({ start: new Date(2026, 10, 17), end: new Date(2026, 10, 24) });
        expect(eventRange('month', now)).toEqual({ start: new Date(2026, 10, 1), end: new Date(2026, 11, 1) });
        expect(eventRange('next-month', new Date(2026, 11, 31))).toEqual({ start: new Date(2027, 0, 1), end: new Date(2027, 1, 1) });
        expect(eventRange('year', now)).toEqual({ start: new Date(2026, 0, 1), end: new Date(2027, 0, 1) });
        expect(eventRange('month', new Date(2028, 1, 29))).toEqual({ start: new Date(2028, 1, 1), end: new Date(2028, 2, 1) });
        const from = new Date(2026, 10, 1), until = new Date(2026, 11, 1);
        expect(occursBetween({ ...event, startDate: '2026-10-29', endDate: '2026-11-01' }, from, until)).toBe(true);
        expect(occursBetween({ ...event, startDate: '2026-12-01', endDate: '2026-12-02' }, from, until)).toBe(false);
        expect(occursBetween({ ...event, startDate: '', endDate: '' }, from, until)).toBe(false);
        expect(occursBetween({ ...event, startDate: '2026-12-01', endDate: '2026-11-01' }, from, until)).toBe(false);
        expect(occursBetween({ ...event, startDate: '', endDate: '2026-11-01T00:00:00Z' }, new Date('2026-11-01T00:00:00Z'), new Date('2026-11-02T00:00:00Z'))).toBe(false);
    });
    it('classifies exact expiration boundaries without treating unknown dates as active', () => {
        const now = new Date(2026, 9, 29, 12).getTime();
        expect(eventStatus({ startDate: '2026-10-29', endDate: '2026-10-29' }, now)).toBe('Active');
        expect(eventStatus({ endDate: '2026-10-29' }, new Date(2026, 9, 30).getTime())).toBe('Ended');
        expect(eventStatus({ startDate: '2026-10-30' }, now)).toBe('Upcoming');
        expect(eventStatus({}, now)).toBe('Undated');
        expect(eventStatus({ eventType: 'permanent' }, now)).toBe('Active');
        expect(eventStatus({ startDate: '2026-02-30' }, now)).toBe('Undated');
        expect(eventStatus({ startDate: '2026-11-02', endDate: '2026-10-29' }, now)).toBe('Undated');
        const end = '2026-10-29T12:00:00Z';
        expect(eventStatus({ endDate: end }, Date.parse(end))).toBe('Ended');
    });
    it('includes end dates, crosses month boundaries, and rejects invalid dates', () => {
        expect(occursOn(event, new Date(2026, 9, 28))).toBe(false);
        expect(occursOn(event, new Date(2026, 9, 29))).toBe(true);
        expect(occursOn(event, new Date(2026, 10, 2))).toBe(true);
        expect(occursOn(event, new Date(2026, 10, 3))).toBe(false);
        expect(eventDate('2026-02-30')).toBeNull();
        expect(eventDate('Indefinite')).toBeNull();
        expect(occursOn({ ...event, startDate: '', endDate: '' }, new Date(2026, 9, 29))).toBe(false);
        expect(monthDays(new Date(2026, 1, 1))).toHaveLength(42);
        expect(monthDays(new Date(2026, 1, 1))[0].getDay()).toBe(1);
    });
    it('uses the full final day and distinguishes upcoming and ended events', () => {
        const oneDay = { ...event, startDate: '2026-10-29', endDate: '2026-10-29' };
        expect(eventTiming(oneDay, new Date(2026, 9, 29, 12).getTime())).toEqual({ label: 'Ends in 12h 0m', urgent: true });
        expect(eventTiming(oneDay, new Date(2026, 9, 28).getTime()).label).toContain('Starts in');
        expect(eventTiming(oneDay, new Date(2026, 9, 30).getTime()).label).toBe('Ended');
    });
});
