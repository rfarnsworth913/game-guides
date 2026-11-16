import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, Injector, input, output, signal, untracked, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { GAMES } from '@lib/constants/workspace.constants';
import { GameNavigationPreferences } from '../../../../core/state/game-navigation-preferences';
import { defaultGameOverview, gameSupports } from '@common/workspace/game-overview';
import type { GameOverview } from '@lib/types/game-overview.type';
import type { GameManagementRequest } from '../game-manager/game-manager';

export type SidebarLink = { id: string; label: string; icon: string; divider?: boolean };
type SidebarMode = 'workspace' | 'game-selection';
type GameFilter = 'all' | 'favorites' | 'recent';

@Component({
    selector: 'gg-workspace-sidebar',
    imports: [RouterLink, RouterLinkActive],
    templateUrl: './workspace-sidebar.html',
    styleUrl: './workspace-sidebar.scss',
})
export class WorkspaceSidebar {
    private readonly router = inject(Router);
    private readonly injector = inject(Injector);
    private readonly destroyRef = inject(DestroyRef);
    private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('gameSearch');
    private readonly selector = viewChild<ElementRef<HTMLButtonElement>>('gameSelector');
    readonly preferences = inject(GameNavigationPreferences);
    readonly activeGameId = input<string | null>(null);
    readonly links = input.required<readonly SidebarLink[]>();
    readonly planCount = input(0);
    readonly catalog = input<GameOverview[]>(GAMES.map(game => defaultGameOverview(game.id)));
    readonly canManage = input(false);
    readonly manageGame = output<GameManagementRequest>();
    readonly navigated = output<void>();
    readonly openNavigation = output<void>();
    readonly mode = signal<SidebarMode>('workspace');
    readonly filter = signal<GameFilter>('all');
    readonly searchQuery = signal('');
    readonly switching = signal(false);
    readonly error = signal('');
    readonly activeGame = computed(() => this.catalog().find(game => game.id === this.activeGameId()));
    readonly workspaceLinks = computed(() => this.links().slice(2).filter(link => gameSupports(this.activeGame(), link.id)));
    readonly failedImages = signal<string[]>([]);
    readonly filters: { id: GameFilter; label: string; icon: string }[] = [
        { id: 'all', label: 'All Games', icon: 'grid' },
        { id: 'favorites', label: 'Favorites', icon: 'star' },
        { id: 'recent', label: 'Recently Used', icon: 'clock' },
    ];
    readonly games = computed(() => {
        const favorites = this.preferences.favoriteGameIds();
        const recent = this.preferences.recentGameIds();
        const query = this.searchQuery().trim().toLocaleLowerCase();
        return this.catalog().filter(game => (!query || game.name.toLocaleLowerCase().includes(query)) &&
            (this.filter() === 'all' || (this.filter() === 'favorites' ? favorites.includes(game.id) : recent.includes(game.id))))
            .sort((a, b) => this.filter() === 'recent' ? recent.indexOf(a.id) - recent.indexOf(b.id) : a.name.localeCompare(b.name));
    });

    constructor() {
        effect(() => {
            const id = this.activeGame()?.id;
            if (id) {untracked(() => this.preferences.remember(id));}
        });
    }

    sectionLink(page: string): string { return `/games/${this.activeGameId()}/${page}`; }
    imageFailed(url: string): void {this.failedImages.update(images => [...images, url]);}

    openSelector(): void {
        this.mode.set('game-selection');
        this.error.set('');
        this.searchQuery.set('');
        this.filter.set('all');
        this.openNavigation.emit();
        afterNextRender(() => this.searchInput()?.nativeElement.focus(), { injector: this.injector });
    }

    closeSelector(): void {
        this.mode.set('workspace');
        this.error.set('');
        afterNextRender(() => this.selector()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
    }

    @HostListener('document:keydown', ['$event'])
    handleShortcut(event: KeyboardEvent): void {
        if (event.defaultPrevented) {return;}
        if (event.key === 'Escape' && this.mode() === 'game-selection') {
            event.preventDefault();
            this.closeSelector();
        } else if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            this.openSelector();
        }
    }

    async selectGame(id: string): Promise<void> {
        if (this.switching() || !this.catalog().some(game => game.id === id)) {return;}
        if (id === this.activeGameId()) {this.closeSelector(); return;}
        this.switching.set(true);
        this.error.set('');
        try {
            if (await this.router.navigateByUrl(`/games/${id}/dashboard`)) {
                this.preferences.remember(id);
                if (!this.destroyRef.destroyed) {
                    this.closeSelector();
                    this.navigated.emit();
                }
            } else {this.error.set('Could not switch games. Please try again.');}
        } catch {this.error.set('Could not switch games. Please try again.');}
        finally {this.switching.set(false);}
    }

    onNavigate(): void {
        this.mode.set('workspace');
        this.navigated.emit();
    }
}
