import { Component, computed, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WorkspaceStore, Entry } from './workspace.store';
import { guideUrl } from '../../../../common/characters';
import { eventDate, eventTiming, eventType, eventTypeLabel, monthDays, occursOn } from './event-calendar';

@Component({
    selector: 'gg-events',
    imports: [FormsModule],
    templateUrl: './events.html',
    styleUrl: './events.scss',
})
export class Events {
    readonly game = input.required<string>();
    readonly edit = output<Entry>();
    readonly remove = output<Entry>();
    readonly store = inject(WorkspaceStore);
    readonly view = signal<'list' | 'calendar'>('list');
    readonly type = signal('');
    readonly search = signal('');
    readonly showCompleted = signal(true);
    readonly now = signal(Date.now());
    readonly month = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    readonly error = signal('');
    readonly message = signal('');
    readonly failedImages = signal(new Set<string>());
    readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    readonly eventType = eventType;
    readonly typeLabel = eventTypeLabel;
    readonly entries = computed(() => this.store.entries().filter(entry => entry.game === this.game() && entry.kind === 'events'));
    readonly types = computed(() => [...new Set(this.entries().map(eventType))].sort((a, b) => eventTypeLabel(a).localeCompare(eventTypeLabel(b))));
    readonly filtered = computed(() => this.entries().filter(entry =>
        (!this.type() || eventType(entry) === this.type()) &&
        (this.showCompleted() || !entry.completed) &&
        entry.name.toLowerCase().includes(this.search().trim().toLowerCase()),
    ).sort((a, b) => (eventDate(a.endDate, true)?.getTime() ?? Infinity) - (eventDate(b.endDate, true)?.getTime() ?? Infinity) || a.order - b.order || a.name.localeCompare(b.name)));
    readonly days = computed(() => monthDays(this.month()).map(date => ({ date,
        key: this.dayKey(date), currentMonth: date.getMonth() === this.month().getMonth(),
        today: this.dayKey(date) === this.dayKey(new Date(this.now())),
        events: this.filtered().filter(entry => occursOn(entry, date)),
    })));
    readonly undated = computed(() => this.filtered().filter(entry => !eventDate(entry.startDate) && !eventDate(entry.endDate, true)));
    readonly weeks = computed(() => Array.from({ length: 6 }, (_, index) => this.days().slice(index * 7, index * 7 + 7)));
    readonly monthLabel = computed(() => this.month().toLocaleDateString([], { month: 'long', year: 'numeric' }));
    readonly busy = computed(() => this.store.saving() || this.store.loading() || !this.store.initialized());

    constructor() {
        const timer = setInterval(() => this.now.set(Date.now()), 60000);
        inject(DestroyRef).onDestroy(() => clearInterval(timer));
        effect(() => { this.game(); this.type.set(''); this.search.set(''); this.error.set(''); this.message.set(''); this.failedImages.set(new Set()); });
    }
    dayKey(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
    dayLabel(date: Date): string { return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
    changeMonth(offset: number): void { this.month.update(date => new Date(date.getFullYear(), date.getMonth() + offset, 1)); }
    today(): void { const date = new Date(this.now()); this.month.set(new Date(date.getFullYear(), date.getMonth(), 1)); }
    timing(entry: Entry) { return eventTiming(entry, this.now()); }
    url(entry: Entry): string | null { return entry.wikiUrl && guideUrl(entry.wikiUrl) ? entry.wikiUrl : null; }
    image(entry: Entry): string | null {
        if (!entry.icon || this.failedImages().has(entry.id)) {return null;}
        if (/^\/?(icons|images|assets)\/[\w/.,% -]+$/i.test(entry.icon)) {return '/' + entry.icon.replace(/^\//, '');}
        return guideUrl(entry.icon) ? entry.icon : null;
    }
    imageFailed(id: string): void { this.failedImages.update(ids => new Set([...ids, id])); }
    dateRange(entry: Entry): string {
        const format = (value?: string) => eventDate(value)?.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
        const start = format(entry.startDate), end = format(entry.endDate);
        return start && end ? `${start} – ${end}` : start ? `From ${start}` : end ? `Until ${end}` : 'Dates unavailable';
    }
    async toggle(entry: Entry): Promise<void> {
        if (this.busy()) {return;}
        this.error.set(''); this.message.set('');
        if (await this.store.save({ ...entry, completed: !entry.completed })) {
            this.message.set(`${entry.name} marked ${entry.completed ? 'incomplete' : 'complete'}.`);
        } else {this.error.set(this.store.error() || 'Could not save event completion. Please retry.');}
    }
}
