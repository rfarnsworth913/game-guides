import { Injectable, signal } from '@angular/core';
import { validRowCompletion } from '../../../../common/story-template';
import type { PlayerState } from '../../../../common/workspace';

import {
    Entry,
    GAMES,
    validEntries,
    parseBackup,
    toCatalog,
    fromCatalog,
    GameSnapshot,
    validCatalog,
} from '../../../../common/workspace';
export type { Entry, Kind } from '../../../../common/workspace';
export { GAMES, validEntries, parseBackup } from '../../../../common/workspace';
const KEY = 'gg-workspace-v1';
@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
    readonly error = signal('');
    readonly entries = signal<Entry[]>([]);
    readonly initialized = signal(false);
    readonly loading = signal(false);
    readonly saving = signal(false);
    private snapshots = new Map<string, GameSnapshot>();
    private loadingPromise: Promise<boolean> | null = null;
    private player: Record<string, PlayerState> = {};
    private playerKey(entry: { game: string; id: string }): string {
        return `${entry.game}/${entry.id}`;
    }
    private async request(path: string, body?: unknown): Promise<unknown> {
        const response = await fetch(`/api/${path}`, {
            method: body ? 'PUT' : 'GET',
            ...(body
                ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
                : {}),
            signal: AbortSignal.timeout(10000),
        });
        const data: unknown = await response.json();
        if (!response.ok) {
            throw new Error(
                data &&
                typeof data === 'object' &&
                'error' in data &&
                typeof data.error === 'string'
                    ? data.error
                    : 'Middleware request failed.',
            );
        }
        return data;
    }
    private snapshot(value: unknown): GameSnapshot {
        if (
            !value ||
            typeof value !== 'object' ||
            !('id' in value) ||
            typeof value.id !== 'string' ||
            !('revision' in value) ||
            !Number.isSafeInteger(value.revision) ||
            Number(value.revision) < 0 ||
            !('entries' in value) ||
            !validCatalog(value.entries, value.id)
        ) {
            throw new Error('Invalid game data received from middleware.');
        }
        return {
            id: value.id,
            name: GAMES.find((g) => g.id === value.id)?.name ?? value.id,
            revision: Number(value.revision),
            entries: value.entries,
        };
    }
    private showSnapshots(): void {
        this.entries.set(
            [...this.snapshots.values()].flatMap((game) =>
                game.entries.map((entry) => fromCatalog(entry, this.player[this.playerKey(entry)])),
            ),
        );
    }
    /** Fetch definitions once, and migrate old browser catalogs only after a successful server write. */
    initialize(): Promise<boolean> {
        if (this.loadingPromise) {
            return this.loadingPromise;
        }
        this.loadingPromise = this.load().finally(() => {
            this.loadingPromise = null;
        });
        return this.loadingPromise;
    }
    private async load(): Promise<boolean> {
        if (this.saving()) {
            return false;
        }
        this.loading.set(true);
        this.initialized.set(false);
        this.error.set('');
        try {
            const progressRaw = localStorage.getItem('gg-player-v1');
            if (progressRaw) {
                const parsed = JSON.parse(progressRaw) as { version?: unknown; state?: unknown };
                if (
                    parsed.version !== 1 ||
                    !parsed.state ||
                    typeof parsed.state !== 'object' ||
                    Array.isArray(parsed.state)
                ) {
                    throw new Error('Invalid local player data. Import a backup to recover it.');
                }
                for (const state of Object.values(parsed.state as Record<string, unknown>)) {
                    if (
                        !state ||
                        typeof state !== 'object' ||
                        !('completed' in state) ||
                        typeof state.completed !== 'boolean' ||
                        !('quantity' in state) ||
                        !Number.isFinite(state.quantity) ||
                        Number(state.quantity) < 0 ||
                        !('target' in state) ||
                        !Number.isFinite(state.target) ||
                        Number(state.target) < 0 ||
                        !validRowCompletion(
                            'storyRowCompletion' in state ? state.storyRowCompletion : undefined,
                        )
                    ) {
                        throw new Error(
                            'Invalid local player data. Your stored data has not been overwritten.',
                        );
                    }
                }
                this.player = parsed.state as typeof this.player;
            }
            const legacyRaw = localStorage.getItem(KEY);
            const legacy = legacyRaw ? parseBackup(legacyRaw) : [];
            const response = await this.request('games');
            if (
                !response ||
                typeof response !== 'object' ||
                !('games' in response) ||
                !Array.isArray(response.games)
            ) {
                throw new Error('Invalid middleware response.');
            }
            const snapshots = response.games.map((game: unknown) => this.snapshot(game));
            if (
                snapshots.length !== GAMES.length ||
                !GAMES.every((game) => snapshots.some((snapshot) => snapshot.id === game.id))
            ) {
                throw new Error('Middleware returned an incomplete game catalog.');
            }
            this.snapshots = new Map(snapshots.map((game) => [game.id, game]));
            if (legacy.length) {
                for (const entry of legacy) {
                    this.player[this.playerKey(entry)] ??= {
                        completed: entry.completed,
                        quantity: entry.quantity,
                        target: entry.target,
                        ...(entry.storyRowCompletion
                            ? { storyRowCompletion: entry.storyRowCompletion }
                            : {}),
                    };
                }
                // Persist completion first; retain the original legacy key until every game has migrated.
                localStorage.setItem(
                    'gg-player-v1',
                    JSON.stringify({ version: 1, state: this.player }),
                );
                for (const game of snapshots) {
                    const merged = new Map(game.entries.map((entry) => [entry.id, entry]));
                    for (const entry of legacy.filter((e) => e.game === game.id)) {
                        if (!merged.has(entry.id)) {
                            merged.set(entry.id, toCatalog(entry));
                        }
                    }
                    if (merged.size !== game.entries.length) {
                        const saved = this.snapshot(
                            await this.request(`games/${game.id}/catalog`, {
                                revision: game.revision,
                                entries: [...merged.values()],
                            }),
                        );
                        this.snapshots.set(game.id, saved);
                    }
                }
            }
            if (legacyRaw) {
                localStorage.removeItem(KEY);
            }
            this.showSnapshots();
            this.initialized.set(true);
            return true;
        } catch (error) {
            this.error.set(
                `${
                    error instanceof Error ? error.message : 'Could not load game data.'
                } Start the app with npm start, then retry. Existing local data has been kept.`,
            );
            return false;
        } finally {
            this.loading.set(false);
        }
    }
    async replace(entries: Entry[]): Promise<boolean> {
        if (!this.initialized() || this.loading() || this.saving()) {
            this.error.set('Game data is not ready or a save is in progress. Please retry.');
            return false;
        }
        if (!validEntries(entries)) {
            this.error.set('Invalid workspace entries.');
            return false;
        }
        this.saving.set(true);
        this.error.set('');
        let wroteCatalog = false;
        try {
            const player = { ...this.player };
            for (const entry of entries) {
                player[this.playerKey(entry)] = {
                    completed: entry.completed,
                    quantity: entry.quantity,
                    target: entry.target,
                    ...(entry.storyRowCompletion
                        ? { storyRowCompletion: entry.storyRowCompletion }
                        : {}),
                };
            }
            // Fail before any database write if browser storage is unavailable.
            localStorage.setItem('gg-player-v1', JSON.stringify({ version: 1, state: player }));
            this.player = player;
            for (const game of GAMES) {
                const snapshot = this.snapshots.get(game.id)!;
                const catalog = entries
                    .filter((entry) => entry.game === game.id)
                    .map(toCatalog)
                    .sort((a, b) => a.id.localeCompare(b.id));
                const previous = snapshot.entries
                    .map((entry) => toCatalog(fromCatalog(entry)))
                    .sort((a, b) => a.id.localeCompare(b.id));
                if (JSON.stringify(catalog) === JSON.stringify(previous)) {
                    continue;
                }
                const saved = this.snapshot(
                    await this.request(`games/${game.id}/catalog`, {
                        revision: snapshot.revision,
                        entries: catalog,
                    }),
                );
                this.snapshots.set(game.id, saved);
                wroteCatalog = true;
            }
            this.showSnapshots();
            return true;
        } catch (error) {
            this.showSnapshots();
            this.error.set(
                `Could not save game data: ${
                    error instanceof Error ? error.message : 'Please retry.'
                }${
                    wroteCatalog
                        ? ' Some games were saved before this error; reload before retrying the rest.'
                        : ''
                } Player progress remains on this device.`,
            );
            return false;
        } finally {
            this.saving.set(false);
        }
    }
    async save(entry: Entry): Promise<boolean> {
        return this.replace([...this.entries().filter((e) => e.id !== entry.id), entry]);
    }
    async remove(id: string): Promise<boolean> {
        return this.replace(
            this.entries()
                .filter(
                    (e) =>
                        e.id !== id &&
                        !(e.kind === 'achievements' && e.category === id) &&
                        !(e.kind === 'story' && e.storySection === id),
                )
                .map((e) => ({
                    ...e,
                    members: e.members.filter((m) => m !== id),
                    requirements: e.requirements.filter((r) => r.item !== id),
                })),
        );
    }
    materials(plans: Entry[]) {
        const totals = new Map<string, number>();
        plans
            .filter((p) => !p.completed)
            .forEach((p) =>
                p.requirements.forEach((r) =>
                    totals.set(r.item, (totals.get(r.item) ?? 0) + r.amount),
                ),
            );
        return [...totals].map(([id, need]) => {
            const item = this.entries().find((e) => e.id === id && e.kind === 'inventory');
            return {
                id,
                name: item?.name ?? 'Missing item',
                game: item?.game ?? '',
                own: item?.quantity ?? 0,
                need,
                missing: Math.max(0, need - (item?.quantity ?? 0)),
                day: item?.day ?? 'Any day',
            };
        });
    }
    /** Moves a category or achievement within its game and persists the complete order atomically. */
    async reorderAchievement(
        id: string,
        beforeId: string | null,
        categoryId?: string,
    ): Promise<boolean> {
        if (!this.initialized()) {
            return false;
        }
        const source = this.entries().find((e) => e.id === id);
        if (!source || !['achievements', 'achievement-category'].includes(source.kind)) {
            return false;
        }
        const category = categoryId ?? source.category;
        if (
            source.kind === 'achievements' &&
            !this.entries().some(
                (e) =>
                    e.id === category &&
                    e.kind === 'achievement-category' &&
                    e.game === source.game,
            )
        ) {
            return false;
        }
        const siblings = this.entries()
            .filter(
                (e) =>
                    e.id !== id &&
                    e.game === source.game &&
                    e.kind === source.kind &&
                    (source.kind === 'achievement-category' || e.category === category),
            )
            .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
        const index =
            beforeId === null ? siblings.length : siblings.findIndex((e) => e.id === beforeId);
        if (index < 0) {
            return false;
        }
        siblings.splice(index, 0, {
            ...source,
            category: source.kind === 'achievements' ? category : source.category,
        });
        const updates = new Map(siblings.map((e, order) => [e.id, { ...e, order }]));
        return this.replace(this.entries().map((e) => updates.get(e.id) ?? e));
    }
    progress(plan: Entry): number {
        if (plan.completed) {
            return 100;
        }
        const materials = this.materials([plan]);
        const need = materials.reduce((sum, m) => sum + m.need, 0);
        return need
            ? Math.round(
                  (100 * materials.reduce((sum, m) => sum + Math.min(m.own, m.need), 0)) / need,
              )
            : 0;
    }
}
