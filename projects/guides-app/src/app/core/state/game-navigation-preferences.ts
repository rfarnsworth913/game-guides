import { inject, Injectable, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { GAMES } from '@lib/constants/workspace.constants';

const STORAGE_KEY = 'gg-game-navigation-v1';
type Preferences = { version: 1; favorites: string[]; recent: string[] };

@Injectable({ providedIn: 'root' })
export class GameNavigationPreferences {
    private readonly window = inject(DOCUMENT).defaultView;
    private readonly saved = this.read();
    private readonly favorites = signal(this.saved.favorites);
    private readonly recent = signal(this.saved.recent);
    readonly favoriteGameIds = this.favorites.asReadonly();
    readonly recentGameIds = this.recent.asReadonly();

    private knownIds(value: unknown): string[] {
        return Array.isArray(value) ? [...new Set(value.filter((id): id is string =>
            typeof id === 'string' && GAMES.some(game => game.id === id)))].slice(0, GAMES.length) : [];
    }

    private read(): Preferences {
        try {
            const raw = this.window?.localStorage.getItem(STORAGE_KEY);
            const value: unknown = raw ? JSON.parse(raw) : null;
            if (value && typeof value === 'object' && 'version' in value && value.version === 1) {
                return { version: 1, favorites: this.knownIds('favorites' in value ? value.favorites : null),
                    recent: this.knownIds('recent' in value ? value.recent : null) };
            }
        } catch { /* Browser preferences are optional when storage is unavailable. */ }
        return { version: 1, favorites: [], recent: [] };
    }

    private persist(): void {
        try {
            this.window?.localStorage.setItem(STORAGE_KEY, JSON.stringify({
                version: 1, favorites: this.favorites(), recent: this.recent(),
            }));
        } catch { /* Keep the current session usable when storage is blocked or full. */ }
    }

    toggleFavorite(id: string): void {
        if (!GAMES.some(game => game.id === id)) {return;}
        this.favorites.update(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
        this.persist();
    }

    remember(id: string): void {
        if (!GAMES.some(game => game.id === id) || this.recent()[0] === id) {return;}
        this.recent.update(ids => [id, ...ids.filter(value => value !== id)].slice(0, GAMES.length));
        this.persist();
    }
}
