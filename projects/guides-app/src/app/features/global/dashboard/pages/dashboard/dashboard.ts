import { Component, computed, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WorkspaceStore } from '../../../../../core/state/workspace.store';
import { AuthStore } from '../../../../../core/auth/auth.store';
import { GameNavigationPreferences } from '../../../../../core/state/game-navigation-preferences';
import { DashboardData } from '../../state/dashboard-data';
import { GameDashboard } from '../../components/game-dashboard';
import { DashboardArtwork } from '../../components/dashboard-artwork';
import { DashboardLoading } from '../../components/dashboard-loading';
import { DashboardTaskGroup } from '../../components/dashboard-task-group';
import { DashboardSection } from '../../components/dashboard-section';
import { DashboardProgress } from '../../components/dashboard-progress';
import { canAccessFeature, canAccessGame } from '@common/workspace/game-overview';
import type { GameRegistration } from '@lib/types/games.type';
import type { DashboardGame, DashboardLink, DashboardProgress as Progress } from '@lib/types/dashboard.type';
import type { Entry } from '@lib/types/workspace.type';
import { eventDate, eventTiming, eventStatus, eventType, eventTypeLabel, occursOn } from '../../../../gacha/events/utils/event-calendar';
import { eventPlanning } from '../../../../gacha/events/utils/event-planning';
import { balanceDay, balanceKey } from '../../../../gacha/events/utils/event-balance';
import { readEventSchedule } from '../../../../gacha/events/utils/event-schedule-preferences';

@Component({ selector: 'gg-dashboard', imports: [GameDashboard, RouterLink, DashboardSection, DashboardProgress, DashboardTaskGroup, DashboardArtwork, DashboardLoading], providers: [DashboardData],
    templateUrl: './dashboard.html', styleUrl: './dashboard.scss' })
export class DashboardPage {
    readonly context = input<GameRegistration>();
    readonly manageGame = output<string>();
    readonly deadlineDays = input(3);
    readonly store = inject(WorkspaceStore);
    readonly auth = inject(AuthStore);
    readonly preferences = inject(GameNavigationPreferences);
    readonly data = inject(DashboardData);
    readonly now = signal(Date.now());
    readonly calendarVersion = signal(0);
    readonly date = computed(() => new Date(this.now()).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }));
    readonly games = computed(() => this.store.games().filter(game => canAccessGame(game, this.store.canEdit())));
    readonly summaries = computed(() => this.data.summary().games.filter(summary => this.games().some(game => game.gameId === summary.game.gameId) &&
        (!this.context() || summary.game.gameId === this.context()!.gameId)));
    readonly gameSummary = computed<DashboardGame | undefined>(() => this.summaries()[0]);
    readonly events = computed(() => this.data.events().entries.filter(entry => this.supportsGame(entry.game, 'events') && (!this.context() || entry.game === this.context()!.gameId)));
    readonly activeEvents = computed(() => this.events().filter(entry => eventStatus(entry, this.now()) === 'Active').sort((a, b) => this.end(a) - this.end(b) || a.name.localeCompare(b.name)));
    readonly endingSoon = computed(() => this.events().filter(entry => !entry.completed && this.end(entry) > this.now() &&
        this.end(entry) <= this.now() + Math.max(0, this.deadlineDays()) * 86400000 && eventStatus(entry, this.now()) !== 'Upcoming')
        .sort((a, b) => this.end(a) - this.end(b) || a.name.localeCompare(b.name)).slice(0, 5));
    readonly todayTasks = computed(() => {
        this.calendarVersion();
        const account = this.auth.user()?.id ?? 'guest', scope = this.context()?.gameId ?? '';
        let balanced = false;
        try {const saved: unknown = JSON.parse(localStorage.getItem(`gg-event-view-v1:${account}:${scope || 'global'}`) ?? '{}'); balanced = !!saved && typeof saved === 'object' && 'balanceEnabled' in saved && saved.balanceEnabled === true;} catch { /* Default calendar behavior. */ }
        const schedule = readEventSchedule('gg-event-schedule-v1:' + account);
        const plan = balanced ? eventPlanning(this.events(), new Date(this.now()), account, scope, schedule).resolve() : null;
        return this.events().filter(entry => plan ? plan.assignments[balanceKey(entry)] === balanceDay(new Date(this.now())) : occursOn(entry, new Date(this.now())))
            .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    });
    readonly todayGroups = computed(() => this.games().map(game => ({ game, entries: this.todayTasks().filter(entry => entry.game === game.gameId) }))
        .filter(group => group.entries.length).sort((a, b) => a.game.name.localeCompare(b.game.name)));
    readonly todayCompleted = computed(() => this.todayTasks().filter(entry => entry.completed).length);
    readonly plans = computed(() => this.summaries().flatMap(summary => summary.plans ?? []).slice(0, 5));
    readonly storyProgress = computed(() => this.sumProgress(this.summaries().map(summary => summary.story)));
    readonly continueGames = computed(() => {
        return this.summaries().filter(summary => summary.progressUpdatedAt || summary.hasProgress)
            .slice().sort((a, b) => (Date.parse(b.progressUpdatedAt ?? '') || 0) - (Date.parse(a.progressUpdatedAt ?? '') || 0) || a.game.name.localeCompare(b.game.name)).slice(0, 4);
    });
    readonly stats = computed(() => {
        const summaries = this.summaries(), story = this.storyProgress();
        const featureLink = (feature: string) => {const game = this.context()?.gameId ?? summaries.find(summary => this.supportsGame(summary.game.gameId, feature))?.game.gameId; return game ? this.link(feature, game) : '/games';};
        return [
            ...(!this.context() ? [{ label: 'Games', value: String(this.games().length), detail: 'In your library', link: '/games', icon: 'games' }] : []),
            ...(this.supports('characters') ? [{ label: 'Characters', value: String(summaries.reduce((sum, item) => sum + (item.characters?.owned ?? 0), 0)), detail: 'In your collection', link: featureLink('characters'), icon: 'characters' }] : []),
            ...(this.supports('plans') || this.supports('characters') ? [{ label: 'Plans', value: String(summaries.reduce((sum, item) => sum + (item.planCount ?? 0), 0)), detail: 'Active goals', link: '#dashboard-plans', icon: 'plans' }] : []),
            ...(this.supports('story') ? [{ label: 'Story Progress', value: this.percent(story), detail: `${story.completed} / ${story.total} items`, link: this.context() ? this.link('story') : '#continue-playing', icon: 'story' }] : []),
            ...(this.supports('events') ? [{ label: 'Active Events', value: String(this.activeEvents().length), detail: `${this.endingSoon().length} ending soon`, link: this.link('events'), icon: 'events' }] : []),
            ...(this.context() && this.supports('achievements') ? [{ label: 'Achievements', value: this.percent(this.gameSummary()?.achievements), detail: 'Completion', link: this.link('achievements'), icon: 'achievements' }] : []),
        ];
    });
    readonly icons: Record<string, string> = {
        games: 'M3 7h18v13H3V7Zm4-3h10M8 11v6m-3-3h6m5-1h.01m2 3h.01',
        characters: 'M4 21v-3a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v3M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
        plans: 'M9 5H5v16h14V5h-4M9 3h6v4H9V3Zm-1 11 3 3 5-6',
        story: 'M12 5c-3-2-7-2-10-1v16c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v16',
        events: 'M3 5h18v16H3V5Zm4-3v6m10-6v6M3 11h18m-11 4h2m2 0h2',
        achievements: 'M7 3h10v5a5 5 0 0 1-10 0V3Zm0 2H3v4l5 3m9-7h4v4l-5 3m-4 1v7m-5 1h10',
    };
    constructor() {
        effect(() => {
            const game = this.context()?.gameId ?? ''; this.auth.user();
            if (this.store.loading() || !this.store.initialized()) {return;}
            untracked(() => this.data.load(game));
        });
        // Returning to the tab must not replace widgets or reset their scroll positions.
        const settingsChanged = (event: StorageEvent) => {if (event.key?.startsWith('gg-event-')) {this.calendarVersion.update(value => value + 1);}};
        window.addEventListener('storage', settingsChanged);
        const timer = setInterval(() => this.now.set(Date.now()), 60000);
        inject(DestroyRef).onDestroy(() => {clearInterval(timer); window.removeEventListener('storage', settingsChanged);});
    }
    hideImage(event: Event): void {if (event.target instanceof HTMLImageElement) {event.target.hidden = true;}}
    statLoading(icon: string): boolean {return icon === 'games' ? this.store.loading() : this.store.loading() || (icon === 'events' ? this.data.eventsLoading() : this.data.summaryLoading());}
    statUnavailable(icon: string): boolean {
        if (icon === 'games') {return false;}
        return icon === 'events' ? this.data.eventsLoading() || !!this.data.eventsError() || !!this.data.events().errors.length
            : this.data.summaryLoading() || !!this.data.summaryError() || !!this.data.summary().errors.length;
    }
    supportsGame(id: string, feature: string): boolean {return canAccessFeature(this.games().find(game => game.gameId === id), feature, this.store.canEdit());}
    supports(feature: string): boolean {return this.games().some(game => (!this.context() || this.context()!.gameId === game.gameId) && this.supportsGame(game.gameId, feature));}
    link(feature: string, game = this.context()?.gameId): string {return game ? `/games/${game}/${feature}` : feature === 'events' ? '/events' : '/games';}
    gameName(id: string): string {return this.games().find(game => game.gameId === id)?.name ?? id;}
    end(entry: Entry): number {return eventDate(entry.endDate, true, entry.eventSchedule)?.getTime() ?? Infinity;}
    timing(entry: Entry): string {return eventTiming(entry, this.now()).label;}
    typeLabel(entry: Entry): string {return eventTypeLabel(eventType(entry));}
    percent(value?: Progress): string {return value?.total ? `${Math.round(value.completed / value.total * 100)}%` : 'N/A';}
    sumProgress(values: (Progress | undefined)[]): Progress {return values.reduce<Progress>((sum, item) => ({ completed: sum.completed + (item?.completed ?? 0), total: sum.total + (item?.total ?? 0) }), { completed: 0, total: 0 });}
    storyQuery(value?: DashboardLink): Record<string, string> | null {return value?.section ? { section: value.section } : null;}
    resume(summary: DashboardGame): { feature: string; label: string } {
        const recent = this.preferences.library().games.find(game => game.gameId === summary.game.gameId)?.lastVisitedFeatureId;
        const labels: Record<string, string> = { story: 'Continue Story', achievements: 'Continue Progress', characters: 'View Characters', plans: 'Continue Plan', events: 'View Events' };
        const preferred = recent && labels[recent] && this.supportsGame(summary.game.gameId, recent) ? recent : Object.keys(labels).find(feature => this.supportsGame(summary.game.gameId, feature));
        return { feature: preferred ?? 'dashboard', label: preferred ? labels[preferred] : 'Open Game' };
    }
    async toggleEvent(entry: Entry, checkbox: HTMLInputElement): Promise<void> {checkbox.checked = entry.completed; await this.data.toggle(entry);}
}
