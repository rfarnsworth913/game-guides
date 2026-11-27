import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WorkspaceStore } from '../../../../core/state/workspace.store';
import { canAccessFeature } from '@common/workspace/game-overview';
import type { GameRegistration } from '@lib/types/games.type';
import type { DashboardLink, DashboardProgress as Progress } from '@lib/types/dashboard.type';
import type { Entry } from '@lib/types/workspace.type';
import { eventDate, eventStatus, eventTiming, eventType, eventTypeLabel } from '../../../gacha/events/utils/event-calendar';
import { DashboardData } from '../state/dashboard-data';
import { DashboardArtwork } from './dashboard-artwork';
import { DashboardSection } from './dashboard-section';
import { DashboardProgress } from './dashboard-progress';
import { DashboardTaskGroup } from './dashboard-task-group';
import { DashboardLoading } from './dashboard-loading';

/** Game-only presentation over the same scoped projections and completion transport as the home dashboard. */
@Component({ selector: 'gg-game-dashboard', imports: [RouterLink, DashboardArtwork, DashboardSection, DashboardProgress, DashboardTaskGroup, DashboardLoading],
    templateUrl: './game-dashboard.html', styleUrl: './game-dashboard.scss' })
export class GameDashboard {
    readonly game = input.required<GameRegistration>();
    readonly events = input<Entry[]>([]);
    readonly tasks = input<Entry[]>([]);
    readonly now = input(Date.now());
    readonly manageGame = output<string>();
    readonly data = inject(DashboardData);
    readonly store = inject(WorkspaceStore);
    readonly summary = computed(() => this.data.summary().games.find(item => item.game.gameId === this.game().gameId));
    readonly summaryFailed = computed(() => !!this.data.summaryError() || this.data.summary().errors.some(item => item.gameId === this.game().gameId));
    readonly eventsFailed = computed(() => !!this.data.eventsError() || this.data.events().errors.some(item => item.gameId === this.game().gameId));
    readonly loading = computed(() => this.store.loading() || this.data.summaryLoading());
    readonly eventLoading = computed(() => this.store.loading() || this.data.eventsLoading());
    readonly scopedTasks = computed(() => this.tasks().filter(item => item.game === this.game().gameId));
    readonly incompleteTasks = computed(() => this.scopedTasks().filter(item => !item.completed));
    readonly completedTasks = computed(() => this.scopedTasks().filter(item => item.completed));
    readonly eventView = signal<'Active' | 'Upcoming'>('Active');
    readonly timedEvents = computed(() => this.events().filter(item => item.game === this.game().gameId &&
        !['daily', 'weekly', 'weekly-linked', 'monthly', 'permanent'].includes(eventType(item)) &&
        Number.isFinite(this.end(item))));
    readonly upcoming = computed(() => this.timedEvents().filter(item => !item.completed && eventStatus(item, this.now()) === 'Upcoming'));
    readonly eventItems = computed(() => {
        const today = new Set(this.scopedTasks().map(item => item.id));
        const view = this.eventView() === 'Upcoming' && this.upcoming().length ? 'Upcoming' : 'Active';
        return this.timedEvents().filter(item => !item.completed && !today.has(item.id) && eventStatus(item, this.now()) === view)
            .sort((a, b) => this.end(a) - this.end(b) || a.name.localeCompare(b.name)).slice(0, 5);
    });
    readonly completedEvents = computed(() => this.timedEvents().filter(item => item.completed && eventStatus(item, this.now()) === 'Active').slice(0, 5));
    readonly activities = computed(() => (this.supports('story') ? this.summary()?.activities ?? [] : []).filter(item => item.total > 0));
    readonly incompleteActivities = computed(() => this.activities().filter(item => item.completed < item.total)
        .sort((a, b) => Number(b.completed > 0) - Number(a.completed > 0) || a.name.localeCompare(b.name)).slice(0, 4));
    readonly completedActivities = computed(() => this.activities().filter(item => item.completed >= item.total));
    readonly plans = computed(() => (this.summary()?.plans ?? []).filter(plan => this.supports(plan.feature)));
    readonly hasPlanning = computed(() => ['plans', 'characters', 'inventory', 'farming'].some(feature => this.supports(feature)));
    readonly hasMaterials = computed(() => {
        const value = this.summary()?.materials;
        return !!value && this.supports('inventory') && value.sufficient + value.partial + value.missing > 0;
    });
    readonly statistics = computed(() => {
        const summary = this.summary();
        return [
            ...(this.supports('characters') ? [{ key: 'characters', label: 'Characters', value: String(summary?.characters?.owned ?? 0), detail: 'In your collection', feature: 'characters' }] : []),
            ...(this.supports('plans') || this.supports('characters') ? [{ key: 'plans', label: 'Plans', value: String(summary?.planCount ?? 0), detail: 'Active goals', feature: this.supports('plans') ? 'plans' : 'characters' }] : []),
            ...(this.supports('story') && summary?.story?.total ? [{ key: 'story', label: 'Story Progress', value: this.percent(summary.story), detail: `${summary.story.completed} / ${summary.story.total} items`, feature: 'story' }] : []),
            ...(this.supports('events') ? [{ key: 'events', label: 'Active Events', value: String(this.timedEvents().filter(item => eventStatus(item, this.now()) === 'Active').length),
                detail: `${this.timedEvents().filter(item => !item.completed && eventStatus(item, this.now()) === 'Active' && this.end(item) - this.now() <= 3 * 86400000).length} ending soon`, feature: 'events' }] : []),
            ...(this.supports('achievements') && summary?.achievements?.total ? [{ key: 'achievements', label: 'Achievements', value: this.percent(summary.achievements), detail: `${summary.achievements.completed} / ${summary.achievements.total} complete`, feature: 'achievements' }] : []),
        ];
    });
    readonly icons: Record<string, string> = {
        story: 'M12 5c-3-2-7-2-10-1v16c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v16',
        tasks: 'M3 5h18v16H3V5Zm4-3v6m10-6v6M3 11h18m-10 5 2 2 4-4',
        events: 'M3 5h18v16H3V5Zm4-3v6m10-6v6M3 11h18m-11 4h2m2 0h2',
        characters: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 0a4 4 0 0 1 0 8',
        plans: 'M9 5H5v16h14V5h-4M9 3h6v4H9V3Zm-1 11 3 3 5-6',
        activities: 'M21 12a9 9 0 1 1-9-9m5 9a5 5 0 1 1-5-5m0 5 9-9m-4 0h4v4',
        achievements: 'M7 3h10v5a5 5 0 0 1-10 0V3Zm0 2H3v4l5 3m9-7h4v4l-5 3m-4 1v7m-5 1h10',
        resources: 'M4 3h5v18H4V3Zm7 0h4v18h-4V3Zm6 1 4-1 3 17-4 1z',
        settings: 'M9.79 4.31 10.72 1.58 13.28 1.58 14.21 4.31 15.88 5 18.46 3.73 20.27 5.54 19 8.12 19.69 9.79 22.42 10.72 22.42 13.28 19.69 14.21 19 15.88 20.27 18.46 18.46 20.27 15.88 19 14.21 19.69 13.28 22.42 10.72 22.42 9.79 19.69 8.12 19 5.54 20.27 3.73 18.46 5 15.88 4.31 14.21 1.58 13.28 1.58 10.72 4.31 9.79 5 8.12 3.73 5.54 5.54 3.73 8.12 5Z',
    };
    date(): string {return new Date(this.now()).toLocaleDateString([], {month:'long',day:'numeric',year:'numeric'});}
    supports(feature: string): boolean {return canAccessFeature(this.game(), feature, this.store.canEdit());}
    link(feature: string): string {return `/games/${this.game().gameId}/${feature}`;}
    query(item?: DashboardLink): Record<string, string> | null {return item?.section ? { section: item.section } : null;}
    end(entry: Entry): number {return eventDate(entry.endDate, true, entry.eventSchedule)?.getTime() ?? Infinity;}
    timing(entry: Entry): string {return eventTiming(entry, this.now()).label;}
    typeLabel(entry: Entry): string {return eventTypeLabel(eventType(entry));}
    percent(progress: Progress): string {return `${Math.round(progress.completed / progress.total * 100)}%`;}
    hideImage(event: Event): void {if (event.target instanceof HTMLImageElement) {event.target.hidden = true;}}
    async complete(entry: Entry, checkbox: HTMLInputElement): Promise<void> {checkbox.checked = entry.completed; await this.data.toggle(entry);}
}
