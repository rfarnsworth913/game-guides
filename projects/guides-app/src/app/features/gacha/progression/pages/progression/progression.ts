import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WorkspaceStore } from '../../../../../core/state/workspace.store';
import type { Entry } from '../../../../../../../../lib/types/workspace.type';
import { GAMES } from '../../../../../../../../lib/constants/workspace.constants';

@Component({ selector: 'gg-progression', imports: [FormsModule], templateUrl: './progression.html', styles: [':host { display: block; }'] })
export class ProgressionPage {
    readonly context = input<(typeof GAMES)[number]>();
    readonly page = input('plans');
    readonly title = input('Planner');
    readonly games = [...GAMES].sort((a, b) => a.name.localeCompare(b.name));
    readonly store = inject(WorkspaceStore);
    readonly editEntry = output<{ kind: string; entry?: Entry }>();
    readonly removeEntry = output<Entry>();
    grid = true;
    constructor() {
        effect(() => { this.context(); this.page(); this.search.set(''); this.category.set(''); this.rarity.set(''); });
    }
    open(kind: string, entry?: Entry): void { this.editEntry.emit({ kind, entry }); }
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
    gameName(id: string): string {
        return this.games.find((g) => g.id === id)?.name ?? 'All games';
    }
    nameOf(id: string): string {
        return this.store.entries().find((e) => e.id === id)?.name ?? 'Unknown';
    }
    async toggleDone(entry: Entry): Promise<void> {
        await this.store.save({ ...entry, completed: !entry.completed });
    }
}
