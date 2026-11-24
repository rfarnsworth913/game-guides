import { Component, computed, DestroyRef, effect, ElementRef, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { DialogFocusDirective } from '../../../../../shared/directives/dialog-focus/dialog-focus';
import { WorkspaceStore, Entry } from "../../../../../core/state/workspace.store";
import { guideUrl } from "@common/characters/characters";
import { eventDate, eventRange, eventStatus, eventTiming, eventType, eventTypeLabel, monthDays, occursBetween, occursOn, type EventDateRange } from "../../utils/event-calendar";
import { gameSupports } from '@common/workspace/game-overview';
import { balanceDay, balanceEvents, balanceKey, type BalancedEvents } from '../../utils/event-balance';
import { readEventSchedule } from '../../utils/event-schedule-preferences';
import { readEventView } from '../../utils/event-view-preferences';
import { readEventPlan, writeEventPlan } from '../../utils/event-plan-preferences';
import { eventProgress, setEventCompletion } from '@common/events/event-progress';
import { compareAvailableEvents } from '../../utils/event-list';

const EVENT_GROUPS_KEY = 'gg-events-groups-v1';

@Component({
    selector: 'gg-events',
    imports: [FormsModule, NgTemplateOutlet, DialogFocusDirective],
    templateUrl: "./events.html",
    styleUrls: ["./events.scss", './event-panels.scss', './event-list.scss', './event-list-insights.scss', './event-planning.scss'],
    host: { '(document:click)': 'closeGroups($event)' },
})
export class Events {
    readonly game = input('');
    readonly selectedGame = signal('');
    readonly selectedGroups = signal<string[]>(this.readGroups());
    private readonly groupPicker = viewChild<ElementRef<HTMLDetailsElement>>('groupPicker');
    private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
    readonly edit = output<Entry>();
    readonly remove = output<Entry>();
    readonly store = inject(WorkspaceStore);
    readonly view = signal<'list' | 'calendar'>('list');
    readonly type = signal('');
    readonly status = signal<'all' | 'not-expired' | 'active'>('all');
    readonly period = signal<EventDateRange>('all');
    readonly periodBounds = computed(() => eventRange(this.period(), new Date(this.now())));
    readonly search = signal('');
    readonly showCompleted = signal(true);
    readonly now = signal(Date.now());
    readonly balanceEnabled = signal(false);
    readonly filtersOpen = signal(false);
    readonly settingsOpen = signal(false);
    readonly summaryFilter = signal<'all' | 'scheduled' | 'completed'>('all');
    readonly collapsedGroups = signal<string[]>([]);
    readonly listSort = signal<'game' | 'deadline'>('game');
    readonly backlogOpen = signal(false);
    readonly selectedDay = signal('');
    readonly backlogSort = signal<'deadline' | 'game' | 'completion'>('deadline');
    readonly manualPins = signal<Record<string, string>>({});
    readonly maxPerDay = signal(0);
    readonly compact = signal(false);
    readonly pinDrafts = signal<Record<string, string>>({});
    readonly completionConfirmation = signal<Entry | null>(null);
    private readonly optimistic = signal<Record<string, boolean>>({});
    private readonly inFlight = signal(false);
    private readonly scheduleScope = signal('');
    private readonly viewScope = signal('');
    readonly eventKey = balanceKey;
    readonly progress = eventProgress;
    readonly balancePlan = signal<BalancedEvents>({ assignments: {}, unscheduled: {}, dailyLimit: 0, start: '', end: '' });
    private lastBalanceKey = '';
    readonly month = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    readonly error = signal('');
    readonly failedImages = signal(new Set<string>());
    readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    readonly eventType = eventType;
    readonly typeLabel = eventTypeLabel;
    readonly games = computed(() => this.store.games().filter(game => gameSupports(game, 'events')).slice().sort((a, b) => a.name.localeCompare(b.name)));
    readonly entries = computed(() => this.store.entries().filter(entry => entry.kind === 'events' &&
        (this.game() ? entry.game === this.game() : this.games().some(game => game.id === entry.game))).map(entry => {
            const completed = this.optimistic()[balanceKey(entry)];
            return completed === globalThis.undefined ? entry : { ...entry, ...setEventCompletion(entry, completed, entry) };
        }));
    readonly types = computed(() => [...new Set(this.entries().map(eventType))].sort((a, b) => eventTypeLabel(a).localeCompare(eventTypeLabel(b))));
    readonly viewCandidates = computed(() => this.entries().filter(entry =>
        (!this.selectedGame() || entry.game === this.selectedGame()) &&
        (this.status() === 'all' || (this.status() === 'active' ? eventStatus(entry, this.now()) === 'Active' : eventStatus(entry, this.now()) !== 'Ended')) &&
        entry.name.toLowerCase().includes(this.search().trim().toLowerCase()),
    ).sort((a, b) => (eventDate(a.endDate, true, a.eventSchedule)?.getTime() ?? Infinity) - (eventDate(b.endDate, true, b.eventSchedule)?.getTime() ?? Infinity) || a.order - b.order || a.name.localeCompare(b.name)));
    readonly typeCandidates = computed(() => this.viewCandidates().filter(entry => this.inDisplayedRange(entry)));
    readonly scopedEvents = computed(() => this.viewCandidates().filter(entry => this.game()
        ? !this.type() || eventType(entry) === this.type()
        : !this.selectedGroups().length || this.selectedGroups().includes(eventType(entry))));
    readonly matching = computed(() => this.scopedEvents().filter(entry => this.inDisplayedRange(entry)));
    readonly visibleEvents = computed(() => this.matching().filter(entry => this.showCompleted() || !entry.completed));
    readonly filtered = computed(() => this.visibleEvents().filter(entry => this.summaryFilter() === 'all' || (this.summaryFilter() === 'completed' ? entry.completed : !!this.plannedDate(entry))));
    readonly listGroups = computed(() => this.games().map(game => {
        const entries = this.filtered().filter(entry => entry.game === game.id).sort((a, b) =>
            (this.balanceEnabled() ? this.plannedDate(a).localeCompare(this.plannedDate(b)) : 0) || compareAvailableEvents(a, b, this.now()));
        return { id: game.id, title: game.name, entries, completed: entries.filter(entry => entry.completed).length,
            deadline: Math.min(...entries.map(entry => this.deadlineTime(entry)).filter(time => time > this.now())) };
    }).filter(group => group.entries.length).sort((a, b) => this.listSort() === 'deadline'
        ? a.deadline - b.deadline || a.title.localeCompare(b.title)
        : a.title.localeCompare(b.title)));
    readonly listStats = computed(() => {
        const entries = this.matching(), completed = entries.filter(entry => entry.completed).length;
        return { total: entries.length, completed, remaining: entries.length - completed,
            percent: entries.length ? Math.round(completed / entries.length * 100) : 0,
            overdue: entries.filter(entry => !entry.completed && eventStatus(entry, this.now()) === 'Ended').length };
    });
    readonly typeCounts = computed(() => this.types().map(type => ({ type, count: this.typeCandidates().filter(entry => eventType(entry) === type).length })));
    readonly nextDeadlines = computed(() => this.matching().filter(entry => !entry.completed &&
        ['Active', 'Upcoming'].includes(eventStatus(entry, this.now())) && Number.isFinite(this.deadlineTime(entry)))
        .sort((a, b) => this.deadlineTime(a) - this.deadlineTime(b) || a.name.localeCompare(b.name)).slice(0, 5));
    readonly listHeading = computed(() => this.period() === 'today' ? "Today's Items" : 'Your Events');
    readonly listDescription = computed(() => this.period() === 'today' ? 'Tasks and events for ' + this.dayLabel(new Date(this.now()))
        : 'Tasks and events across ' + (this.game() || this.selectedGame() ? this.gameName(this.game() || this.selectedGame()) : 'all your games'));
    readonly planningRange = computed(() => {
        const today = new Date(this.now());
        return { start: new Date(today.getFullYear(), today.getMonth(), today.getDate()), end: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30) };
    });
    private readonly planStorageKey = computed(() => `gg-event-plan-v1:${this.store.auth?.user()?.id ?? 'guest'}:${this.game() || 'global'}`);
    private readonly balanceInputs = computed(() => JSON.stringify({
        datePolicy: 'local-calendar-end-2359-v1',
        account: this.store.auth?.user()?.id ?? 'guest',
        pins: this.manualPins(), capacity: this.maxPerDay(),
        today: balanceDay(new Date(this.now())), scope: this.game(),
        entries: this.entries().map(entry => ({ key: balanceKey(entry), start: entry.startDate, end: entry.endDate, schedule: entry.eventSchedule, expired: (eventDate(entry.endDate, true, entry.eventSchedule)?.getTime() ?? Infinity) <= this.now() })).sort((a, b) => a.key.localeCompare(b.key)),
    }));
    readonly days = computed(() => monthDays(this.month()).map(date => ({ date,
        key: this.dayKey(date), currentMonth: date.getMonth() === this.month().getMonth(),
        today: this.dayKey(date) === this.dayKey(new Date(this.now())),
        events: this.periodBounds() && (date < this.periodBounds()!.start || date >= this.periodBounds()!.end) ? [] : this.filtered().filter(entry => this.balanceEnabled() ? this.balancePlan().assignments[balanceKey(entry)] === this.dayKey(date) : occursOn(entry, date)),
    })));
    readonly unscheduled = computed(() => this.scopedEvents().filter(entry => (this.showCompleted() || !entry.completed) && !this.balancePlan().assignments[balanceKey(entry)]));
    readonly plannedCount = computed(() => Object.keys(this.balancePlan().assignments).length);
    readonly scheduledCount = computed(() => this.visibleEvents().filter(entry => !!this.plannedDate(entry)).length);
    readonly remainingCount = computed(() => this.visibleEvents().filter(entry => !entry.completed && !!this.plannedDate(entry)).length);
    readonly completedCount = computed(() => this.matching().filter(entry => entry.completed).length);
    readonly backlog = computed(() => this.unscheduled().slice().sort((a, b) => {
        const order = this.backlogSort() === 'game' ? this.gameName(a.game).localeCompare(this.gameName(b.game)) : this.backlogSort() === 'completion' ? Number(a.completed) - Number(b.completed) : 0;
        return order || compareAvailableEvents(a, b, this.now());
    }));
    readonly dayEvents = computed(() => this.days().find(day => day.key === this.selectedDay())?.events ?? []);
    readonly pinnedEvents = computed(() => this.entries().filter(entry => !!this.manualPins()[balanceKey(entry)]));
    readonly undated = computed(() => this.filtered().filter(entry => !eventDate(entry.startDate, false, entry.eventSchedule) && !eventDate(entry.endDate, true, entry.eventSchedule)));
    readonly weeks = computed(() => Array.from({ length: 6 }, (_, index) => this.days().slice(index * 7, index * 7 + 7)));
    readonly monthLabel = computed(() => this.month().toLocaleDateString([], { month: 'long', year: 'numeric' }));
    readonly busy = computed(() => this.inFlight() || this.store.saving() || this.store.loading() || !this.store.initialized());

    constructor() {
        const timer = setInterval(() => this.now.set(Date.now()), 60000);
        inject(DestroyRef).onDestroy(() => clearInterval(timer));
        effect(() => {
            const game = this.game(), account = this.store.auth?.user()?.id ?? 'guest';
            const scope = `gg-event-view-v1:${account}:${game || 'global'}`;
            untracked(() => {
                const today = new Date();
                const saved = readEventView(scope, { view: game ? 'list' : 'calendar', selectedGame: '', groups: this.readGroups(), type: '', status: 'all', period: 'all', search: '',
                    showCompleted: true, balanceEnabled: false, filtersOpen: false, month: balanceDay(today).slice(0, 7), backlogSort: 'deadline', settingsOpen: false, summaryFilter: 'all', collapsedGroups: [], listSort: 'game' });
                this.selectedGame.set(game ? '' : saved.selectedGame); this.selectedGroups.set(saved.groups); this.type.set(saved.type);
                this.status.set(saved.status); this.period.set(saved.period); this.view.set(saved.view); this.search.set(saved.search);
                this.showCompleted.set(saved.showCompleted); this.balanceEnabled.set(saved.balanceEnabled); this.filtersOpen.set(saved.filtersOpen); this.backlogSort.set(saved.backlogSort);
                this.settingsOpen.set(saved.settingsOpen); this.summaryFilter.set(saved.summaryFilter); this.collapsedGroups.set(saved.collapsedGroups);
                this.listSort.set(saved.listSort);
                const [year, month] = saved.month.split('-').map(Number); this.month.set(new Date(year, month - 1, 1));
                this.error.set(''); this.failedImages.set(new Set()); this.closePanels(); this.pinDrafts.set({});
                this.lastBalanceKey = ''; this.viewScope.set(scope);
            });
        });
        effect(() => {
            const scope = this.viewScope();
            if (scope !== `gg-event-view-v1:${this.store.auth?.user()?.id ?? 'guest'}:${this.game() || 'global'}`) {return;}
            const saved = { version: 1, view: this.view(), selectedGame: this.selectedGame(), groups: this.selectedGroups(), type: this.type(), status: this.status(), period: this.period(), search: this.search(),
                showCompleted: this.showCompleted(), balanceEnabled: this.balanceEnabled(), filtersOpen: this.filtersOpen(), month: balanceDay(this.month()).slice(0, 7), backlogSort: this.backlogSort(),
                settingsOpen: this.settingsOpen(), summaryFilter: this.summaryFilter(), collapsedGroups: this.collapsedGroups(), listSort: this.listSort() };
            try {localStorage.setItem(scope, JSON.stringify(saved));} catch { /* Controls remain usable when browser storage is blocked. */ }
        });
        effect(() => {
            const scope = 'gg-event-schedule-v1:' + (this.store.auth?.user()?.id ?? 'guest');
            const saved = readEventSchedule(scope);
            untracked(() => {this.manualPins.set(saved.pins); this.maxPerDay.set(saved.maxPerDay); this.compact.set(saved.compact); this.scheduleScope.set(scope);});
        });
        effect(() => {
            const scope = this.scheduleScope();
            if (!scope) {return;}
            const saved = { version: 1, pins: this.manualPins(), maxPerDay: this.maxPerDay(), compact: this.compact() };
            try {localStorage.setItem(scope, JSON.stringify(saved));} catch { /* Manual assignments still work without storage. */ }
        });
        effect(() => {
            if (!this.balanceEnabled() || this.store.loading() || !this.store.initialized()) {this.lastBalanceKey = ''; return;}
            const key = this.balanceInputs();
            if (key === this.lastBalanceKey) {return;}
            this.lastBalanceKey = key;
            untracked(() => {
                const range = this.planningRange();
                const saved = readEventPlan(this.planStorageKey(), key, balanceDay(range.start), balanceDay(range.end));
                if (saved) {this.balancePlan.set(saved);} else {this.rebalance();}
            });
        });
    }
    setBalance(enabled: boolean): void {this.balanceEnabled.set(enabled);}
    rebalance(): void {
        const plan = balanceEvents(this.entries(), new Date(this.now()), this.planningRange(), { maxPerDay: this.maxPerDay(), pins: this.manualPins() });
        this.balancePlan.set(plan);
        this.lastBalanceKey = this.balanceInputs();
        writeEventPlan(this.planStorageKey(), this.lastBalanceKey, plan);
    }
    inDisplayedRange(entry: Entry): boolean {
        const range = this.periodBounds();
        if (!this.balanceEnabled()) {return !range || occursBetween(entry, range.start, range.end);}
        const assigned = this.plannedDate(entry);
        return !!assigned && (!range || (assigned >= balanceDay(range.start) && assigned < balanceDay(range.end)));
    }
    plannedDate(entry: Entry): string {return this.balancePlan().assignments[balanceKey(entry)] ?? '';}
    balanceReason(entry: Entry): string {return this.balancePlan().unscheduled[balanceKey(entry)] ?? 'Select Rebalance to add this event to the plan.';}
    plannedDateLabel(entry: Entry): string {return eventDate(this.plannedDate(entry))?.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) ?? '';}
    remaining(events: Entry[]): number {return events.filter(entry => !entry.completed).length;}
    setGroupOpen(id: string, event: Event): void {
        const open = (event.target as HTMLDetailsElement).open;
        this.collapsedGroups.update(groups => open ? groups.filter(group => group !== id) : groups.includes(id) ? groups : [...groups, id]);
    }
    expandGroups(): void {this.collapsedGroups.set([]);}
    collapseGroups(): void {this.collapsedGroups.set(this.listGroups().map(group => group.id));}
    typeSelected(type: string): boolean {return this.game() ? !this.type() || this.type() === type : !this.selectedGroups().length || this.selectedGroups().includes(type);}
    toggleListType(type: string): void {
        if (this.game()) {this.type.set(this.type() === type ? '' : type); return;}
        const selected = this.selectedGroups().length ? this.selectedGroups().filter(value => value !== '__none__') : this.types();
        const next = selected.includes(type) ? selected.filter(value => value !== type) : [...selected, type];
        // An empty array means All in the existing filter contract; use a sentinel for None.
        this.selectedGroups.set(next.length === this.types().length ? [] : next.length ? next : ['__none__']);
    }
    deadlineTime(entry: Entry): number {return (eventStatus(entry, this.now()) === 'Upcoming' ? eventDate(entry.startDate, false, entry.eventSchedule) : eventDate(entry.endDate, true, entry.eventSchedule))?.getTime() ?? Infinity;}
    deadlineLabel(entry: Entry): string {
        const label = this.availability(entry);
        return ['daily', 'weekly', 'weekly-linked', 'monthly'].includes(eventType(entry)) ? label.replace('Ends in', 'Resets in') : label;
    }
    gameIcon(id: string): string | null {
        const icon = this.games().find(game => game.id === id)?.icon;
        return icon && !this.failedImages().has('game:' + id) && (guideUrl(icon) || /^\/?(?:icons|images|assets)\/[\w/.,% -]+$/i.test(icon)) ? icon : null;
    }
    typeIcon(type: string): string {
        if (['daily', 'weekly', 'weekly-linked', 'monthly'].includes(type)) {return 'M4 5h16v16H4ZM8 2v6m8-6v6M4 11h16m-12 4h2m4 0h2';}
        if (type === 'end-game') {return 'm4 3 7 7-3 3-7-7Zm16 0-7 7 3 3 7-7ZM8 16l-5 5m13-5 5 5M3 16l5 5m8 0 5-5';}
        if (type === 'story') {return 'M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1Zm0 0v16';}
        if (type === 'banner') {return 'm12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z';}
        return 'm12 3 9 5v8l-9 5-9-5V8Zm0 0v18M3 8l9 5 9-5';
    }
    showSummary(filter: 'scheduled' | 'completed'): void {
        this.summaryFilter.set(filter); this.view.set('list');
        if (filter === 'completed') {this.showCompleted.set(true); this.expandGroups();}
    }
    availability(entry: Entry): string {
        const status = eventStatus(entry, this.now());
        if (status === 'Undated') {return 'Unknown availability';}
        if (status === 'Ended') {return 'Ended ' + (eventDate(entry.endDate, false, entry.eventSchedule)?.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) ?? '');}
        return eventDate(entry.endDate, true, entry.eventSchedule) ? this.timing(entry).label : status === 'Upcoming' ? this.timing(entry).label : 'No end date';
    }
    gameColor(id: string): string {return this.games().find(game => game.id === id)?.color || 'var(--muted)';}
    tooltip(entry: Entry): string {
        const progress = this.progress(entry);
        return [entry.name, this.gameName(entry.game), this.plannedDate(entry) ? 'Suggested: ' + this.plannedDateLabel(entry) : 'Dates: ' + this.dateRange(entry),
            'Deadline: ' + (entry.endDate || 'Not specified'), progress.total ? `${progress.completed} / ${progress.total} required objectives` : entry.completed ? 'Completed' : 'Incomplete',
            ...(progress.optionalTotal ? [`${progress.optionalCompleted} / ${progress.optionalTotal} optional objectives`] : [])].join('\n');
    }
    pinInput(entry: Entry): string {return (this.pinDrafts()[balanceKey(entry)] ?? this.manualPins()[balanceKey(entry)] ?? this.plannedDate(entry)) || balanceDay(new Date(this.now()));}
    setPinDraft(entry: Entry, value: string): void {this.pinDrafts.update(values => ({ ...values, [balanceKey(entry)]: value }));}
    pinEvent(entry: Entry): void {
        const value = this.pinInput(entry), day = eventDate(value);
        const today = eventDate(balanceDay(new Date(this.now())))!;
        const start = eventDate(entry.startDate, false, entry.eventSchedule), end = eventDate(entry.endDate, true, entry.eventSchedule);
        const next = day ? new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1) : null;
        if (!day || !next || day < today || (entry.startDate && !start) || (entry.endDate && !end) || (start && start >= next) || (end && (day >= end || end.getTime() <= this.now()))) {this.error.set('Choose a date during the event availability and before its deadline.'); return;}
        const bounds = this.planningRange();
        if (day < bounds.start || day >= bounds.end) {this.error.set('Choose a date within the next 30 days.'); return;}
        const load = this.entries().filter(other => balanceKey(other) !== balanceKey(entry) && !other.completed && this.plannedDate(other) === value).length;
        if (this.maxPerDay() && load >= this.maxPerDay()) {this.error.set('That day has reached its task limit. Choose another date or increase the limit.'); return;}
        this.error.set(''); this.manualPins.update(pins => ({ ...pins, [balanceKey(entry)]: value })); this.setBalance(true);
    }
    unpin(entry: Entry): void {this.manualPins.update(pins => {const next = { ...pins }; Reflect.deleteProperty(next, balanceKey(entry)); return next;});}
    setDailyLimit(value: number | null): void {
        if (value !== null && (!Number.isInteger(value) || value < 1 || value > 1000)) {this.error.set('Daily limit must be a whole number from 1 to 1000, or empty for automatic.'); return;}
        this.error.set(''); this.maxPerDay.set(value ?? 0);
    }
    closePanels(): void {this.backlogOpen.set(false); this.selectedDay.set(''); this.completionConfirmation.set(null);}
    private readGroups(): string[] {
        try {
            const raw = localStorage.getItem(EVENT_GROUPS_KEY);
            const saved: unknown = raw ? JSON.parse(raw) : null;
            if (saved && typeof saved === 'object' && 'version' in saved && saved.version === 1 && 'types' in saved &&
                Array.isArray(saved.types) && saved.types.length <= 100 &&
                saved.types.every((type: unknown) => typeof type === 'string' && !!type.trim() && type.length <= 160)) {
                return [...new Set(saved.types as string[])];
            }
        } catch { /* Ignore malformed preferences or blocked browser storage. */ }
        return [];
    }
    toggleGroup(group: string): void {this.selectedGroups.update(groups => groups.includes(group) ? groups.filter(value => value !== group) : [...groups, group]);}
    selectPeriod(period: EventDateRange): void {
        this.period.set(period);
        if (period === 'all') {return;}
        const anchor = period === 'next-month' ? this.periodBounds()!.start : new Date(this.now());
        this.month.set(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    }
    closeGroups(event: MouseEvent): void {
        const picker = this.groupPicker()?.nativeElement;
        if (picker?.open && !event.composedPath().includes(picker)) {picker.open = false;}
        for (const menu of this.hostElement.nativeElement.querySelectorAll<HTMLDetailsElement>('.event-admin-actions[open], .event-schedule-actions[open]')) {
            if (!event.composedPath().includes(menu)) {menu.open = false;}
        }
    }
    gameName(id: string): string {return this.games().find(game => game.id === id)?.name ?? id;}
    gameShort(id: string): string {return this.games().find(game => game.id === id)?.short ?? id;}
    dayKey(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
    dayLabel(date: Date): string { return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
    changeMonth(offset: number): void { this.month.update(date => new Date(date.getFullYear(), date.getMonth() + offset, 1)); }
    today(): void { const date = new Date(this.now()); this.month.set(new Date(date.getFullYear(), date.getMonth(), 1)); }
    timing(entry: Entry) { return eventTiming(entry, this.now()); }
    url(entry: Entry): string | null {
        const placement = this.store.entries().find(item => item.kind === 'story' && item.game === entry.game && item.eventId === entry.id);
        if (placement) {return `/games/${entry.game}/story${placement.storySection ? '?section=' + encodeURIComponent(placement.storySection) : ''}#story-content-${encodeURIComponent(placement.id)}`;}
        return entry.wikiUrl && guideUrl(entry.wikiUrl) ? entry.wikiUrl : null;
    }
    external(entry: Entry): boolean {return /^https?:/.test(this.url(entry) ?? '');}
    image(entry: Entry): string | null {
        const image = entry.icon || entry.eventStory?.imageUrl;
        if (!image || this.failedImages().has(entry.id)) {return null;}
        if (/^\/?(icons|images|assets)\/[\w/.,% -]+$/i.test(image)) {return '/' + image.replace(/^\//, '');}
        return guideUrl(image) ? image : null;
    }
    imageFailed(id: string): void { this.failedImages.update(ids => new Set([...ids, id])); }
    dateRange(entry: Entry): string {
        const format = (value?: string) => eventDate(value)?.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
        const start = format(entry.startDate), end = format(entry.endDate);
        return start && end ? `${start} – ${end}` : start ? `From ${start}` : end ? `Until ${end}` : 'Dates unavailable';
    }
    async toggle(entry: Entry, event?: Event): Promise<void> {
        event?.stopPropagation();
        if (event?.target instanceof HTMLInputElement) {event.target.checked = entry.completed;}
        if (this.busy()) {return;}
        if (!this.progress(entry).canComplete) {this.error.set('Set the event cycle ID before changing completion.'); return;}
        if (this.progress(entry).total > 1) {this.completionConfirmation.set(entry); return;}
        await this.complete(entry);
    }
    async confirmCompletion(): Promise<void> {
        const entry = this.completionConfirmation(); this.completionConfirmation.set(null);
        if (entry) {await this.complete(entry);}
    }
    private async complete(entry: Entry): Promise<void> {
        const completed = !entry.completed, key = balanceKey(entry);
        this.error.set('');
        this.inFlight.set(true); this.optimistic.update(values => ({ ...values, [key]: completed }));
        try {
            const state = setEventCompletion(entry, completed, entry);
            if (!await this.store.save({ ...entry, ...state })) {this.error.set(this.store.error() || 'Could not save event completion. Please retry.');}
        } catch (error) {this.error.set(error instanceof Error ? error.message : 'Could not save event completion.');}
        finally {this.optimistic.update(values => {const next = { ...values }; Reflect.deleteProperty(next, key); return next;}); this.inFlight.set(false);}
    }
}
