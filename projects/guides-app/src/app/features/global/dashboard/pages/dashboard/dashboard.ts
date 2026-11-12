import { Component, computed, DestroyRef, effect, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import type { Entry } from '../../../../../../../../lib/types/workspace.type';
import { DashboardState } from '../../state/dashboard-state';
import { eventDate, eventTiming, eventType, eventTypeLabel } from '../../../../gacha/events/utils/event-calendar';
import { guideUrl } from '../../../../../../../../common/characters/characters';

const EVENT_FILTERS_KEY = 'gg-dashboard-event-filters-v1';

@Component({ selector: 'gg-dashboard', imports: [RouterLink], templateUrl: './dashboard.html', styleUrl: './dashboard.scss',
    host: { '(document:click)': 'closeEventTypes($event)' },
})
export class DashboardPage extends DashboardState {
    private readonly document = inject(DOCUMENT);
    private readonly eventTypePicker = viewChild<ElementRef<HTMLDetailsElement>>('typePicker');
    readonly editPlan = output<Entry | undefined>();
    readonly now = signal(Date.now());
    readonly eventFilters = ['All Events', 'Active', 'Upcoming', 'Ended'];
    private readonly savedEventFilters = this.readEventFilters();
    readonly eventFilter = signal(this.savedEventFilters.status);
    readonly selectedEventTypes = signal<string[]>(this.savedEventFilters.types);
    readonly eventError = signal('');
    readonly eventBusy = computed(() => this.store.saving() || this.store.loading() || !this.store.initialized());
    readonly showAllEvents = signal(false);
    readonly failedImages = signal(new Set<string>());
    readonly events = computed(() => this.scoped().filter(entry => entry.kind === 'events'));
    readonly eventTypes = computed(() => [...new Set(this.events().map(eventType))]
        .sort((a, b) => eventTypeLabel(a).localeCompare(eventTypeLabel(b))));
    readonly eventTypeLabel = eventTypeLabel;
    readonly activeEvents = computed(() => this.events().filter(entry => this.eventStatus(entry) === 'Active'));
    readonly dueSoon = computed(() => this.activeEvents().filter(entry => {
        const end = eventDate(entry.endDate, true)?.getTime();
        return typeof end === 'number' && end - this.now() <= 3 * 86400000;
    }).length);
    readonly filteredEvents = computed(() => this.events()
        .filter(entry => this.eventFilter() === 'All Events' || this.eventStatus(entry) === this.eventFilter())
        .filter(entry => !this.selectedEventTypes().length || this.selectedEventTypes().includes(eventType(entry)))
        .sort((a, b) => {
            const rank = (entry: Entry) => ({ Active: 0, Upcoming: 1, Undated: 2, Ended: 3 })[this.eventStatus(entry)];
            const date = (entry: Entry) => eventDate(entry.endDate, true)?.getTime() ?? Infinity;
            return rank(a) - rank(b) || (this.eventStatus(a) === 'Ended' ? date(b) - date(a) : date(a) - date(b)) || a.name.localeCompare(b.name);
        }));
    readonly resumeGuide = computed(() => [...this.dashboardStories()]
        .filter(guide => guide.resume).sort((a, b) => b.visitedAt - a.visitedAt)[0]);
    readonly stats = computed(() => [
        { label: 'Games', value: this.context() ? 1 : this.games.length, detail: 'Worlds to explore', link: '/games', icon: 'games' },
        { label: 'Characters', value: this.count('characters'), detail: 'In your collection', link: this.sectionLink('characters'), icon: 'characters' },
        { label: 'Plans', value: this.plans().length, detail: 'Farming & goals', link: this.sectionLink('plans'), icon: 'plans' },
        { label: 'Story Progress', value: `${this.storyCompletion().percent}%`, detail: `${this.storyCompletion().completed} / ${this.storyCompletion().total} items`, link: this.sectionLink('story'), icon: 'story' },
        { label: 'Active Events', value: this.activeEvents().length, detail: `${this.dueSoon()} ending within 3 days`, link: '#dashboard-events', icon: 'events' },
    ]);
    readonly icons: Record<string, string> = {
        games: 'M6 8h12l3 10a2 2 0 0 1-3 2l-4-3h-4l-4 3a2 2 0 0 1-3-2L6 8Zm1 4h4m-2-2v4m7-2h.01m2 2h.01',
        characters: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8 0a4 4 0 0 1 0 8',
        plans: 'M9 5H5v16h14V5h-4M9 3h6v4H9V3Zm-1 11 3 3 5-6',
        story: 'M12 5c-3-2-7-2-10-1v16c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v16',
        events: 'M3 5h18v16H3V5Zm4-3v6m10-6v6M3 11h18M7 15h2m4 0h2m2 0h1m-11 3h2m4 0h2',
    };
    constructor() {
        super();
        const timer = setInterval(() => this.now.set(Date.now()), 60000);
        inject(DestroyRef).onDestroy(() => clearInterval(timer));
        effect(() => {
            const filters = { version: 1, status: this.eventFilter(), types: this.selectedEventTypes() };
            try {
                this.document.defaultView?.localStorage.setItem(EVENT_FILTERS_KEY, JSON.stringify(filters));
            } catch { /* Filters still work when browser storage is unavailable. */ }
        });
    }
    private readEventFilters(): { status: string; types: string[] } {
        try {
            const raw = this.document.defaultView?.localStorage.getItem(EVENT_FILTERS_KEY);
            const filters: unknown = raw ? JSON.parse(raw) : null;
            if (filters && typeof filters === 'object' &&
                'version' in filters && filters.version === 1 &&
                'status' in filters && typeof filters.status === 'string' && this.eventFilters.includes(filters.status) &&
                'types' in filters && Array.isArray(filters.types) && filters.types.every((type: unknown) => typeof type === 'string')) {
                return { status: filters.status, types: [...new Set(filters.types as string[])] };
            }
        } catch { /* Ignore invalid or inaccessible saved preferences. */ }
        return { status: 'Active', types: [] };
    }
    eventStatus(entry: Entry): 'Active' | 'Upcoming' | 'Ended' | 'Undated' {
        const start = eventDate(entry.startDate)?.getTime();
        const end = eventDate(entry.endDate, true)?.getTime();
        if (typeof start === 'number' && typeof end === 'number' && end <= start) { return 'Undated'; }
        if (typeof end === 'number' && this.now() >= end) { return 'Ended'; }
        if (typeof start === 'number' && this.now() < start) { return 'Upcoming'; }
        return typeof start === 'number' || typeof end === 'number' ? 'Active' : 'Undated';
    }
    timing(entry: Entry) { return eventTiming(entry, this.now()); }
    typeLabel(entry: Entry): string { return eventTypeLabel(eventType(entry)); }
    gameShort(id: string): string { return this.games.find(game => game.id === id)?.short ?? id; }
    gameColor(id: string): string | undefined { return this.games.find(game => game.id === id)?.color; }
    dateRange(entry: Entry): string {
        const format = (value?: string) => eventDate(value)?.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        return [format(entry.startDate), format(entry.endDate)].filter(Boolean).join(' – ') || 'Dates unavailable';
    }
    image(entry: Entry): string | null {
        if (!entry.icon || this.failedImages().has(entry.id)) { return null; }
        if (/^\/?(icons|images|assets)\/[\w/.,% -]+$/i.test(entry.icon)) { return '/' + entry.icon.replace(/^\//, ''); }
        return guideUrl(entry.icon) ? entry.icon : null;
    }
    imageFailed(id: string): void { this.failedImages.update(ids => new Set([...ids, id])); }
    closeEventTypes(event: MouseEvent): void {
        const picker = this.eventTypePicker()?.nativeElement;
        if (picker?.open && !event.composedPath().includes(picker)) { picker.open = false; }
    }
    toggleEventType(type: string): void {
        this.selectedEventTypes.update(types => types.includes(type) ? types.filter(value => value !== type) : [...types, type]);
        this.showAllEvents.set(false);
    }
    resetEventFilters(): void {
        this.eventFilter.set('All Events');
        this.selectedEventTypes.set([]);
        this.showAllEvents.set(false);
    }
    async toggleEvent(entry: Entry, checkbox?: HTMLInputElement): Promise<void> {
        if (checkbox) { checkbox.checked = entry.completed; }
        if (this.eventBusy()) { return; }
        this.eventError.set('');
        if (!await this.store.save({ ...entry, completed: !entry.completed })) {
            this.eventError.set(this.store.error() || 'Could not save event completion. Please retry.');
        }
    }
    openEvents(): void {
        this.resetEventFilters();
        this.document.getElementById('dashboard-events')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    open(_kind: string, entry?: Entry): void { this.editPlan.emit(entry); }
}
