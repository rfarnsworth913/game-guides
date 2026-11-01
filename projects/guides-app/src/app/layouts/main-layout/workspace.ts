import { DashboardPage } from '../../features/global/dashboard/pages/dashboard/dashboard';
import { GameCollectionPage } from '../../features/global/dashboard/pages/game-collection/game-collection';
import { SettingsPage } from '../../features/global/settings/pages/settings/settings';
import { ProgressionPage } from '../../features/gacha/progression/pages/progression/progression';
import { AccountMenu, accountInitials } from "../../features/global/accounts/components/account-menu/account-menu";
import { AuthStore } from "../../core/auth/auth.store";
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ThemeService } from "../../core/theme/theme.service";
import { GameTheme } from "../../models/types/index";
import { Entry, GAMES, Kind, validEntries, WorkspaceStore } from "../../core/state/workspace.store";
import { Achievements } from "../../features/gacha/achievements/pages/achievements/achievements";
import { Story } from "../../features/gacha/story-guide/pages/story-guide/story";
import { Characters } from "../../features/gacha/characters/pages/characters/characters";
import { Events } from "../../features/gacha/events/pages/events/events";
import { Teams } from "../../features/gacha/teams/pages/teams/teams";
import { Inventory } from "../../features/gacha/inventory/pages/inventory/inventory";
import { Farming } from "../../features/gacha/farming/pages/farming/farming";
import { GameImagePicker } from "../../shared/components/image-selector/game-image-picker";
import { EventType } from "../../../../../lib/enums/event-types.enum";
import { guideUrl } from "../../../../../common/characters/characters";
import { eventDate } from "../../features/gacha/events/utils/event-calendar";
import { BackToTop } from "../../shared/components/back-to-top/back-to-top";
import { DialogFocusDirective } from "../../shared/directives/dialog-focus/dialog-focus";

@Component({
    selector: 'gg-workspace',
    imports: [DashboardPage, GameCollectionPage, SettingsPage, ProgressionPage, AccountMenu, FormsModule, RouterLink, RouterLinkActive, DialogFocusDirective, Achievements, Story, Characters, Events, Teams, Inventory, Farming, GameImagePicker, BackToTop],
    templateUrl: "./workspace.html",
    styleUrl: "./workspace.scss",
})
export class Workspace {
    readonly eventTypes = [...Object.values(EventType), 'custom'];
    private readonly router = inject(Router);
    readonly store = inject(WorkspaceStore);
    readonly theme = inject(ThemeService);
    readonly auth = inject(AuthStore);
    readonly accountInitials = accountInitials;
    readonly params = toSignal(inject(ActivatedRoute).paramMap);
    readonly settingsParams = toSignal(inject(ActivatedRoute).queryParamMap);
    readonly settingsTab = computed(() => this.settingsParams()?.get('tab'));
    readonly games = [...GAMES].sort((a, b) => a.name.localeCompare(b.name));
    readonly nav = [
        { id: 'dashboard', label: 'Dashboard', icon: '\u25c8' },
        { id: 'games', label: 'Games Collection', icon: '\u25a6' },
        { id: 'characters', label: 'Characters', icon: '\u2659', divider: false },
        { id: 'teams', label: 'Teams', icon: '\u2667', divider: false },
        { id: 'inventory', label: 'Inventory', icon: '\u25a3', divider: false },
        { id: 'plans', label: 'Planner', icon: '\u2713', divider: false },
        { id: 'events', label: 'Events', icon: 'calendar', divider: true },
        { id: 'farming', label: 'Farming', icon: '\u25c7', divider: false },
        { id: 'story', label: 'Story Guide', icon: '\u2637', divider: true },
        { id: 'achievements', label: 'Achievements', icon: '\u2606', divider: false },
    ];
    readonly page = computed(() => this.params()?.get('page') ?? 'dashboard');
    readonly title = computed(() =>
        this.page() === 'dashboard' && this.context()
            ? 'Overview'
            : this.nav.find((n) => n.id === this.page())?.label ?? 'Settings',
    );
    readonly context = computed(() => this.games.find((g) => g.id === this.params()?.get('game')));
    constructor() {
        this.store.initialize().catch(() => this.notice.set('Could not initialize game data.'));
        effect(() => {
            const game = this.params()?.get('game');
            if (game && !this.context()) {
                this.navigate('/games');
                return;
            }
            this.theme.setGame((this.context()?.id ?? 'default') as GameTheme);
        });
    }
    sectionLink(page: string): string {
        return this.context() ? `/games/${this.context()!.id}/${page}` : '/games';
    }
    readonly scoped = computed(() =>
        this.store.entries().filter((e) => !this.context() || e.game === this.context()!.id),
    );
    readonly search = signal('');
    readonly category = signal('');
    readonly rarity = signal('');
    readonly plans = computed(() =>
        this.scoped().filter((e) => e.kind === 'plans' && !e.completed),
    );
    readonly date = new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
    mobile = false;
    editor: Entry | null = null;
    formError = '';
    readonly notice = signal('');
    pendingDelete: Entry | null = null;
    requirementItem = '';
    requirementAmount = 1;
    readonly days = [
        'Any day',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
    ];
    private navigate(path: string): void {
        this.router.navigateByUrl(path).catch(() => {
            this.notice.set('Could not open this page. Please try again.');
        });
    }
    setGame(value: string): void {
        const page = [
            'dashboard',
            'inventory',
            'characters',
            'teams',
            'plans',
            'story',
            'farming',
            'events',
            'achievements',
        ].includes(this.page())
            ? this.page()
            : 'dashboard';
        this.navigate(value === 'default' ? '/dashboard' : `/games/${value}/${page}`);
        this.search.set('');
        this.category.set('');
        this.rarity.set('');
    }
    gameName(id: string): string {
        return this.games.find((g) => g.id === id)?.name ?? 'All games';
    }
    isExisting(id: string): boolean {
        return this.store.entries().some((e) => e.id === id);
    }
    count(kind: string): number {
        return this.scoped().filter((e) => e.kind === kind && (kind !== 'characters' || e.characterCollection?.owned)).length;
    }
    nameOf(id: string): string {
        return this.store.entries().find((e) => e.id === id)?.name ?? 'Unknown';
    }
    open(kind: string, entry?: Entry): void {
        if (!this.context()) {
            this.navigate(entry ? `/games/${entry.game}/${kind}` : '/games');
            return;
        }
        this.formError = '';
        this.requirementItem = '';
        this.editor = entry
            ? structuredClone(entry)
            : {
                  id: crypto.randomUUID(),
                  kind: kind as Kind,
                  game: this.context()?.id ?? 'genshin',
                  name: '',
                  notes: '',
                  quantity: 0,
                  target: 90,
                  category: kind === 'story' ? 'Required' : 'Materials',
                  rarity: 5,
                  members: [],
                  requirements: [],
                  completed: false,
                  order: this.count('story') + 1,
                  day: 'Any day',
              };
    }
    options(kind: string): Entry[] {
        return this.store.entries().filter((e) => e.kind === kind && e.game === this.editor?.game);
    }
    changeEditorGame(): void {
        if (this.editor) {
            this.editor.members = [];
            this.editor.requirements = [];
        }
    }
    toggleMember(id: string): void {
        if (this.editor) {
            this.editor.members = this.editor.members.includes(id)
                ? this.editor.members.filter((m) => m !== id)
                : [...this.editor.members, id];
        }
    }
    addRequirement(): void {
        if (
            !this.editor ||
            !this.options('inventory').some((e) => e.id === this.requirementItem) ||
            !Number.isFinite(this.requirementAmount) ||
            this.requirementAmount <= 0
        ) {
            this.formError = 'Choose an inventory item and a positive required quantity.';
            return;
        }
        const existing = this.editor.requirements.find((r) => r.item === this.requirementItem);
        if (existing) {
            existing.amount += this.requirementAmount;
        } else {
            this.editor.requirements.push({
                item: this.requirementItem,
                amount: this.requirementAmount,
            });
        }
        this.formError = '';
    }
    removeRequirement(id: string): void {
        if (this.editor) {
            this.editor.requirements = this.editor.requirements.filter((r) => r.item !== id);
        }
    }
    async save(): Promise<void> {
        if (!this.editor) {
            return;
        }
        this.editor.name = this.editor.name.trim();
        if (this.editor.kind === 'events') {
            const entry = this.editor;
            if ((entry.wikiUrl && !guideUrl(entry.wikiUrl)) ||
                (entry.startDate && !eventDate(entry.startDate)) ||
                (entry.endDate && !eventDate(entry.endDate, true)) ||
                (entry.startDate && entry.endDate && eventDate(entry.endDate, true)! <= eventDate(entry.startDate)!)) {
                this.formError = 'Use an HTTP(S) event URL and valid dates, with the end on or after the start.';
                return;
            }
        }
        if (!this.editor.name || !validEntries([this.editor])) {
            this.formError = 'Enter a name and valid non-negative numbers.';
            return;
        }
        if (await this.store.save(this.editor)) {
            this.editor = null;
            this.notice.set('Game data saved. Player progress stays on this device.');
        }
    }
    setMaxStack(value: number | null): void {
        if (!this.editor) return;
        if (value === null) delete this.editor.maxStack;
        else this.editor.maxStack = value;
    }
    async remove(): Promise<void> {
        if (this.pendingDelete && (await this.store.remove(this.pendingDelete.id))) {
            this.pendingDelete = null;
        }
    }
}
