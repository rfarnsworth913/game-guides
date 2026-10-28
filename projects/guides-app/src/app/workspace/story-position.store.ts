import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { AuthStore } from './auth.store';

export type StoryPosition = { entryId: string; rowId?: string; visitedAt: number };

/** Device-local reading positions, isolated by account; completion stays in WorkspaceStore. */
@Injectable({ providedIn: 'root' })
export class StoryPositionStore {
    private readonly auth = inject(AuthStore);
    private readonly version = signal(0);
    private readonly memory = new Map<string, Record<string, StoryPosition>>();
    private readonly key = computed(() => `gg-story-position-v1:${this.auth.user()?.id ?? 'guest'}`);
    readonly positions = computed<Record<string, StoryPosition>>(() => {
        this.version();
        const key = this.key();
        if (this.memory.has(key)) return this.memory.get(key)!;
        try {
            const value: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                const positions = Object.fromEntries(Object.entries(value).filter(([, item]) =>
                    item && typeof item === 'object' && typeof item.entryId === 'string' &&
                    (item.rowId === undefined || typeof item.rowId === 'string') &&
                    typeof item.visitedAt === 'number' && Number.isFinite(item.visitedAt),
                ));
                this.memory.set(key, positions);
                return positions;
            }
        } catch { /* Continue with in-memory positions if storage is unavailable. */ }
        return this.memory.get(key) ?? {};
    });
    constructor() {
        const changed = (event: StorageEvent) => {
            if (event.key === null) this.memory.clear();
            else this.memory.delete(event.key);
            if (event.key === this.key() || event.key === null) {
                this.version.update(n => n + 1);
            }
        };
        window.addEventListener('storage', changed);
        inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', changed));
    }
    remember(game: string, entryId: string, rowId?: string, revisit = false): void {
        const previous = this.positions()[game];
        if (!revisit && previous?.entryId === entryId && previous.rowId === rowId) return;
        const positions = { ...this.positions(), [game]: { entryId, ...(rowId ? { rowId } : {}), visitedAt: Date.now() } };
        this.memory.set(this.key(), positions);
        try { localStorage.setItem(this.key(), JSON.stringify(positions)); } catch { /* Keep the location for this session. */ }
        this.version.update(n => n + 1);
    }
}
