import { Directive, computed, inject, input } from '@angular/core';
import { WorkspaceStore } from '../../../../core/state/workspace.store';
import { StoryPositionStore } from '../../../gacha/story-guide/state/story-position.store';
import { storyDashboard } from '../../../gacha/story-guide/utils/story-dashboard';
import { storyProgress } from '../../../gacha/story-guide/utils/story-progress';
import { GAMES } from '../../../../../../../lib/constants/workspace.constants';

/** Read model shared by the global dashboard and game collection views. */
@Directive()
export abstract class DashboardState {
    readonly context = input<(typeof GAMES)[number]>();
    readonly games = [...GAMES].sort((a, b) => a.name.localeCompare(b.name));
    readonly store = inject(WorkspaceStore);
    readonly storyPositions = inject(StoryPositionStore);
    readonly storyDashboards = computed(() => Object.fromEntries(this.games.map(game => [game.id,
        storyDashboard(this.store.entries(), game.id, this.storyPositions.positions()[game.id]),
    ])));
    readonly storyCompletion = computed(() => storyProgress(this.story()));
    readonly dashboardStories = computed(() => this.games.filter(game => !this.context() || this.context()!.id === game.id)
        .map(game => ({ ...game, ...this.storyDashboards()[game.id] }))
        .sort((a, b) => a.name.localeCompare(b.name)));
    readonly scoped = computed(() =>
        this.store.entries().filter((e) => !this.context() || e.game === this.context()!.id),
    );
    readonly plans = computed(() =>
        this.scoped().filter((e) => e.kind === 'plans' && !e.completed),
    );
    readonly materials = computed(() => this.store.materials(this.plans()));
    readonly today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
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
    sectionLink(page: string): string {
        return this.context() ? `/games/${this.context()!.id}/${page}` : '/games';
    }
    gameName(id: string): string {
        return this.games.find((g) => g.id === id)?.name ?? 'All games';
    }
    count(kind: string): number {
        return this.scoped().filter((e) => e.kind === kind && (kind !== 'characters' || e.characterCollection?.owned)).length;
    }
    gameCount(game: string, kind: string): number {
        return this.store.entries().filter((e) => e.game === game && e.kind === kind && (kind !== 'characters' || e.characterCollection?.owned)).length;
    }
}
