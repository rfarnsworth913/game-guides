import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Events } from './events';
import { Entry, WorkspaceStore } from './workspace.store';
import { eventDate, eventTiming, monthDays, occursOn } from './event-calendar';

const event: Entry = { id: 'event', game: 'genshin', kind: 'events', name: 'Snowball Fight',
    notes: '', category: '', rarity: 1, members: [], requirements: [], completed: false,
    order: 0, day: '', quantity: 0, target: 0, eventType: 'temporary',
    startDate: '2026-10-29', endDate: '2026-11-02', wikiUrl: 'https://example.com/event' };

describe('Event tracking', () => {
    function setup() {
        const entries = signal<Entry[]>([structuredClone(event), { ...event, id: 'daily', name: 'Daily Commissions', eventType: 'daily', startDate: '', endDate: '' }, { ...event, id: 'other-game', game: 'hsr' }]);
        const save = vi.fn(async (entry: Entry) => { entries.update(values => values.map(value => value.id === entry.id ? entry : value)); return true; });
        const store = { entries, save, canEdit: signal(false), saving: signal(false), loading: signal(false), initialized: signal(true), error: signal('Save failed') };
        TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: store }] });
        const fixture = TestBed.createComponent(Events);
        fixture.componentRef.setInput('game', 'genshin');
        fixture.detectChanges();
        return { fixture, store, root: fixture.nativeElement as HTMLElement };
    }
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
        expect(root.querySelector<HTMLInputElement>('.event-completion input')!.checked).toBe(true);
        await fixture.componentInstance.toggle(store.entries()[0]);
        expect(store.entries()[0].completed).toBe(false);
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
    it('keeps undated events accessible and blocks unsafe URLs', () => {
        const { fixture, root } = setup();
        fixture.componentInstance.view.set('calendar'); fixture.detectChanges();
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
});

describe('Event calendar dates', () => {
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
