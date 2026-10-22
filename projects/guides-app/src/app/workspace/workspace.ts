import { AccountMenu, accountInitials } from './account-menu';
import { AuthStore } from './auth.store';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ThemeService } from '../services/theme-switcher/theme.service';
import { GameTheme } from '../lib/types';
import { Entry, GAMES, Kind, validEntries, parseBackup, WorkspaceStore } from './workspace.store';
import { Achievements } from './achievements';
import { Story } from './story';
import { Characters } from './characters';
import { BackToTop } from './back-to-top';
import { DialogFocusDirective } from './dialog-focus';
import { StoryPositionStore } from './story-position.store';
import { storyDashboard } from './story-dashboard';
import { storyProgress } from './story-progress';

@Component({
    selector: 'gg-workspace',
    imports: [AccountMenu, FormsModule, RouterLink, RouterLinkActive, DialogFocusDirective, Achievements, Story, Characters, BackToTop],
    templateUrl: './workspace.html',
    styleUrl: './workspace.scss',
})
export class Workspace {
    private readonly router = inject(Router);
    readonly store = inject(WorkspaceStore);
    readonly theme = inject(ThemeService);
    readonly auth = inject(AuthStore);
    readonly storyPositions = inject(StoryPositionStore);
    readonly storyDashboards = computed(() => Object.fromEntries(this.games.map(game => [game.id,
        storyDashboard(this.store.entries(), game.id, this.storyPositions.positions()[game.id]),
    ])));
    readonly storyCompletion = computed(() => storyProgress(this.story()));
    readonly dashboardStories = computed(() => this.games.filter(game => !this.context() || this.context()!.id === game.id)
        .map(game => ({ ...game, ...this.storyDashboards()[game.id] }))
        .sort((a, b) => a.name.localeCompare(b.name)));
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
    readonly rows = computed(() =>
        this.scoped()
            .filter(
                (e) =>
                    e.kind === this.page() &&
                    e.name.toLowerCase().includes(this.search().toLowerCase()) &&
                    (!this.category() || e.category === this.category()) &&
                    (!this.rarity() || e.rarity === Number(this.rarity())),
            )
            .sort((a, b) => a.order - b.order),
    );
    readonly categories = computed(() => [
        ...new Set(
            this.scoped()
                .filter((e) => e.kind === this.page())
                .map((e) => e.category),
        ),
    ]);
    readonly plans = computed(() =>
        this.scoped().filter((e) => e.kind === 'plans' && !e.completed),
    );
    readonly materials = computed(() => this.store.materials(this.plans()));
    readonly today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    readonly date = new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
    readonly farming = computed(() =>
        this.materials().filter(
            (m) => m.missing > 0 && (m.day === 'Any day' || m.day === this.today),
        ),
    );
    readonly story = computed(() =>
        this.scoped()
            .filter((e) => e.kind === 'story')
            .sort((a, b) => a.order - b.order),
    );
    readonly nextStory = computed(() => this.story().find((e) => !e.completed));
    mobile = false;
    grid = true;
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
    gameCount(game: string, kind: string): number {
        return this.store.entries().filter((e) => e.game === game && e.kind === kind && (kind !== 'characters' || e.characterCollection?.owned)).length;
    }
    gameProgress(game: string): number {
        const entries = this.store
            .entries()
            .filter((e) => e.game === game && (e.kind === 'plans' || e.kind === 'story'));
        return entries.length
            ? Math.round(
                  entries.reduce(
                      (sum, e) =>
                          sum +
                          (e.kind === 'plans' ? this.store.progress(e) : e.completed ? 100 : 0),
                      0,
                  ) / entries.length,
              )
            : 0;
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
    nameOf(id: string): string {
        return this.store.entries().find((e) => e.id === id)?.name ?? 'Unknown';
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
        if (!this.editor.name || !validEntries([this.editor])) {
            this.formError = 'Enter a name and valid non-negative numbers.';
            return;
        }
        if (await this.store.save(this.editor)) {
            this.editor = null;
            this.notice.set('Game data saved. Player progress stays on this device.');
        }
    }
    async toggleDone(entry: Entry): Promise<void> {
        await this.store.save({ ...entry, completed: !entry.completed });
    }
    async remove(): Promise<void> {
        if (this.pendingDelete && (await this.store.remove(this.pendingDelete.id))) {
            this.pendingDelete = null;
        }
    }
    exportData(): void {
        const url = URL.createObjectURL(
            new Blob([JSON.stringify({ version: 1, entries: this.store.entries(), characterRules: this.store.characterRules() }, null, 2)], {
                type: 'application/json',
            }),
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = 'game-guides-backup.json';
        a.click();
        URL.revokeObjectURL(url);
    }
    async importData(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }
        try {
            if (file.size > 5000000) {
                throw new Error();
            }
            const raw = await file.text();
            const entries = parseBackup(raw);
            const rules = JSON.parse(raw).characterRules;
            const merged = new Map(this.store.entries().map((e) => [e.id, e]));
            entries.forEach((e) => merged.set(e.id, e));
            if (await this.store.replace([...merged.values()], rules)) {
                this.notice.set('Backup imported. Matching entries were updated.');
            }
        } catch {
            this.notice.set(
                'Invalid backup. Choose a Game Guides JSON export (maximum 5 MB). Nothing was changed.',
            );
        }
        input.value = '';
    }
}
