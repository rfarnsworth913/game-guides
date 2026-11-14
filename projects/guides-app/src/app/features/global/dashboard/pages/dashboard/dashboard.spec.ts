import { Injector, runInInjectionContext, signal } from '@angular/core';
import { AuthStore } from '../../../../../core/auth/auth.store';
import { TestBed } from '@angular/core/testing';

import { provideRouter } from '@angular/router';
import { DashboardPage } from './dashboard';
import { WorkspaceStore, GAMES, type Entry } from '../../../../../core/state/workspace.store';
import { StoryPositionStore } from '../../../../gacha/story-guide/state/story-position.store';

describe('Dashboard feature ownership', () => {
    const savedValues = new Map<string, string>();
    const storage = {
        getItem: vi.fn((key: string) => savedValues.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => { savedValues.set(key, value); }),
    };
    const originalStorage = Object.getOwnPropertyDescriptor(document.defaultView!, 'localStorage');
    beforeEach(() => {
        savedValues.clear();
        Object.defineProperty(document.defaultView!, 'localStorage', { configurable: true, value: storage });
    });
    afterEach(() => {
        if (originalStorage) { Object.defineProperty(document.defaultView!, 'localStorage', originalStorage); }
    });
    function createEventDashboard() {
        const fixture = TestBed.createComponent(DashboardPage);
        fixture.componentInstance.now.set(new Date(2026, 10, 12, 12).getTime());
        fixture.detectChanges();
        return fixture;
    }
    function setupEvents() {
        const store = runInInjectionContext(Injector.create({ providers: [{ provide: AuthStore, useValue: null }] }), () => new WorkspaceStore());
        const event = (id: string, startDate: string, endDate: string, game = 'genshin'): Entry => ({
            id, name: id, game, kind: 'events', startDate, endDate, category: 'temporary', notes: '',
            order: 0, rarity: 1, day: '', members: [], requirements: [], quantity: 0, target: 1, completed: false,
        });
        store.entries.set([
            event('later', '2026-11-01', '2026-11-20'),
            event('ended', '2026-11-01', '2026-11-10'),
            event('upcoming', '2026-11-14', '2026-11-16'),
            event('soon', '2026-11-01', '2026-11-12', 'hsr'),
            event('undated', '', ''),
            event('invalid', '2026-11-25', '2026-11-01'),
        ]);
        TestBed.configureTestingModule({ providers: [provideRouter([]),
            { provide: WorkspaceStore, useValue: store },
            { provide: StoryPositionStore, useValue: { positions: signal({}) } },
        ] });
        const fixture = createEventDashboard();
        return { fixture, page: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
    }
    it('prioritizes active events by their inclusive ending dates and scopes game dashboards', () => {
        const { fixture, page, root } = setupEvents();
        expect(page.filteredEvents().map(entry => entry.id)).toEqual(['soon', 'later']);
        expect(page.dueSoon()).toBe(1);
        expect(root.querySelector('.dashboard-event')?.textContent).toContain('soon');
        expect(root.querySelector('.dashboard-event-link')?.getAttribute('href')).toBe('/games/hsr/events');
        fixture.componentRef.setInput('context', GAMES.find(game => game.id === 'genshin'));
        fixture.detectChanges();
        expect(page.filteredEvents().map(entry => entry.id)).toEqual(['later']);
        expect(page.activeEvents()).toHaveLength(1);
        expect(page.dueSoon()).toBe(0);
    });
    it('filters upcoming and ended events, keeps undated events out of active counts, and updates over time', () => {
        const { page } = setupEvents();
        page.eventFilter.set('Upcoming');
        expect(page.filteredEvents().map(entry => entry.id)).toEqual(['upcoming']);
        page.eventFilter.set('Ended');
        expect(page.filteredEvents().map(entry => entry.id)).toEqual(['ended']);
        page.eventFilter.set('All Events');
        expect(page.filteredEvents().map(entry => entry.id)).toEqual(['soon', 'later', 'upcoming', 'invalid', 'undated', 'ended']);
        page.now.set(new Date(2026, 10, 13).getTime());
        expect(page.activeEvents().map(entry => entry.id)).toEqual(['later']);
        expect(page.eventStatus(page.events().find(entry => entry.id === 'soon')!)).toBe('Ended');
    });
    it('falls back for unsafe or broken event thumbnails', () => {
        const { page } = setupEvents();
        const event = page.events()[0];
        expect(page.image({ ...event, icon: 'data:text/html,unsafe' })).toBeNull();
        expect(page.image({ ...event, icon: 'icons/genshin-impact/event.svg' })).toBe('/icons/genshin-impact/event.svg');
        page.imageFailed(event.id);
        expect(page.image({ ...event, icon: 'https://example.com/image.webp' })).toBeNull();
    });
    it('restores saved status and multiple types after recreating the dashboard and persists resets', () => {
        const { page, fixture } = setupEvents();
        page.eventFilter.set('Upcoming');
        page.toggleEventType('temporary');
        page.toggleEventType('daily');
        fixture.detectChanges();
        fixture.destroy();
        const refreshed = createEventDashboard();
        expect(refreshed.componentInstance.eventFilter()).toBe('Upcoming');
        expect(refreshed.componentInstance.selectedEventTypes()).toEqual(['temporary', 'daily']);
        expect(refreshed.componentInstance.filteredEvents().map(entry => entry.id)).toEqual(['upcoming']);
        refreshed.componentInstance.resetEventFilters();
        refreshed.detectChanges();
        refreshed.destroy();
        const reset = createEventDashboard();
        expect(reset.componentInstance.eventFilter()).toBe('All Events');
        expect(reset.componentInstance.selectedEventTypes()).toEqual([]);
    });
    it.each(['invalid json', '{"version":1,"status":"invalid","types":[]}', '{"version":1,"status":"Active","types":[5]}'])('ignores invalid saved event filters: %s', raw => {
        storage.setItem('gg-dashboard-event-filters-v1', raw);
        const { page } = setupEvents();
        expect(page.eventFilter()).toBe('Active');
        expect(page.selectedEventTypes()).toEqual([]);
    });
    it('keeps filters usable when localStorage reads and writes are blocked', () => {
        const read = vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
        const write = vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
        const { page, fixture } = setupEvents();
        page.eventFilter.set('Upcoming');
        page.toggleEventType('temporary');
        expect(() => fixture.detectChanges()).not.toThrow();
        expect(page.filteredEvents().map(entry => entry.id)).toEqual(['upcoming']);
        read.mockRestore();
        write.mockRestore();
    });
    it('closes the type dropdown on outside clicks while preserving multi-select choices', () => {
        const { root, page } = setupEvents();
        const picker = root.querySelector<HTMLDetailsElement>('.event-type-filter')!;
        picker.querySelector('summary')!.click();
        expect(picker.open).toBe(true);
        picker.querySelectorAll<HTMLInputElement>('input')[1].click();
        expect(picker.open).toBe(true);
        expect(page.selectedEventTypes()).toEqual(['temporary']);
        document.body.click();
        expect(picker.open).toBe(false);
        expect(page.selectedEventTypes()).toEqual(['temporary']);
    });
    it('combines event type and status filters and resets both', () => {
        const { page, fixture, root } = setupEvents();
        page.store.entries.update(entries => entries.map(entry => entry.id === 'soon' ? { ...entry, eventType: 'daily' } : entry));
        fixture.detectChanges();
        const daily = [...root.querySelectorAll<HTMLLabelElement>('.event-type-options label')].find(label => label.textContent?.includes('Daily'))!.querySelector('input')!;
        daily.click();
        fixture.detectChanges();
        expect(page.filteredEvents().map(entry => entry.id)).toEqual(['soon']);
        const temporary = [...root.querySelectorAll<HTMLLabelElement>('.event-type-options label')].find(label => label.textContent?.includes('Limited-time'))!.querySelector('input')!;
        temporary.click();
        fixture.detectChanges();
        expect(page.selectedEventTypes()).toEqual(['daily', 'temporary']);
        expect(page.filteredEvents().map(entry => entry.id)).toEqual(['soon', 'later']);
        temporary.click();
        fixture.detectChanges();
        page.eventFilter.set('Upcoming');
        expect(page.filteredEvents()).toEqual([]);
        root.querySelector<HTMLButtonElement>('.reset-events')!.click();
        expect(page.selectedEventTypes()).toEqual([]);
        expect(page.eventFilter()).toBe('All Events');
        expect(page.filteredEvents()).toHaveLength(6);
    });
    it('saves checkbox completion without navigating and highlights completed rows', async () => {
        const { page, fixture, root } = setupEvents();
        page.store.initialized.set(true);
        const save = vi.spyOn(page.store, 'save').mockImplementation(async entry => {
            page.store.entries.update(entries => entries.map(value => value.id === entry.id ? entry : value));
            return true;
        });
        fixture.detectChanges();
        const checkbox = root.querySelector<HTMLInputElement>('.dashboard-event-completion')!;
        const originalRows = [...root.querySelectorAll('.dashboard-event')];
        const originalTags = originalRows[0].querySelectorAll('.event-tags > span').length;
        expect(checkbox.closest('a')).toBeNull();
        checkbox.click();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'soon', completed: true }));
        expect(root.querySelector('.dashboard-event.is-completed .event-countdown')?.textContent).toContain('Completed');
        expect([...root.querySelectorAll('.dashboard-event')]).toEqual(originalRows);
        expect(originalRows[0].querySelectorAll('.event-tags > span')).toHaveLength(originalTags);
        expect(root.textContent).not.toContain('marked complete');
        expect(checkbox.checked).toBe(true);
        checkbox.click();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(checkbox.checked).toBe(false);
    });
    it('reports failed saves and prevents completion writes while busy', async () => {
        const { page, fixture, root } = setupEvents();
        page.store.initialized.set(true);
        const save = vi.spyOn(page.store, 'save').mockResolvedValue(false);
        page.store.error.set('Could not sync progress');
        fixture.detectChanges();
        const checkbox = root.querySelector<HTMLInputElement>('.dashboard-event-completion')!;
        checkbox.click();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(checkbox.checked).toBe(false);
        expect(page.eventError()).toBe('Could not sync progress');
        expect(page.events()[0].completed).toBe(false);
        page.store.saving.set(true);
        await page.toggleEvent(page.events()[0]);
        expect(save).toHaveBeenCalledTimes(1);
    });
    it('scopes summaries to the selected game and emits plan editing to the shell', () => {
        const store = runInInjectionContext(Injector.create({ providers: [{ provide: AuthStore, useValue: null }] }), () => new WorkspaceStore());
        const entry = (id: string, game: string, kind: Entry['kind']): Entry => ({
            id, game, kind, name: id, category: '', notes: '', order: 0, rarity: 1, day: '',
            members: [], requirements: [], quantity: 0, target: 1, completed: false,
            ...(kind === 'characters' ? { characterCollection: { owned: true, level: 1, gear: {}, progression: {}, notes: '' } } : {}),
        });
        const plan = entry('Plan', 'genshin', 'plans');
        store.entries.set([entry('One', 'genshin', 'characters'), entry('Two', 'hsr', 'characters'), plan]);
        TestBed.configureTestingModule({ providers: [provideRouter([]),
            { provide: WorkspaceStore, useValue: store },
            { provide: StoryPositionStore, useValue: { positions: signal({}) } },
        ] });
        const fixture = TestBed.createComponent(DashboardPage);
        fixture.detectChanges();
        expect(fixture.componentInstance.count('characters')).toBe(2);
        fixture.componentRef.setInput('context', GAMES.find(game => game.id === 'genshin'));
        fixture.detectChanges();
        expect(fixture.componentInstance.count('characters')).toBe(1);
        expect(fixture.componentInstance.dashboardStories().map(game => game.id)).toEqual(['genshin']);
        let selected: Entry | undefined;
        fixture.componentInstance.editPlan.subscribe(value => { selected = value; });
        ((fixture.nativeElement as HTMLElement) as HTMLElement).querySelector<HTMLButtonElement>('.plan-row')!.click();
        expect(selected).toBe(plan);
    });
});
