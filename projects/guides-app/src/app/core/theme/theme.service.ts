import { Injectable, OnDestroy, signal } from "@angular/core";

import { GameTheme, GlobalTheme } from "@models/types";

import { GAME_THEMES } from '../../games/registry/game-themes';
import { gameColorChannels, normalizeGameColor } from '@common/workspace/game-overview';


@Injectable({ providedIn: "root" })
export class ThemeService implements OnDestroy {
    private readonly systemTheme = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    readonly preference = signal<'system' | GlobalTheme>(this.readPreference());
    private readonly activeTheme = signal<GlobalTheme>(this.resolveTheme());
    private readonly activeGame = signal<GameTheme>(this.readGame());
    private highlight: string | null = null;

    readonly theme = this.activeTheme.asReadonly();
    readonly game = this.activeGame.asReadonly();
    private readonly systemChanged = (): void => {
        if (this.preference() === 'system') {
            this.activeTheme.set(this.resolveTheme());
            this.applyTheme();
        }
    };
    constructor() {
        this.systemTheme?.addEventListener('change', this.systemChanged);
    }
    ngOnDestroy(): void {
        this.systemTheme?.removeEventListener('change', this.systemChanged);
    }
    private readPreference(): 'system' | GlobalTheme {
        const saved = this.read('gg-theme');
        return saved === 'light' || saved === 'system' ? saved : 'dark';
    }
    private resolveTheme(): GlobalTheme {
        return this.preference() === 'system' ? (this.systemTheme?.matches ? 'dark' : 'light') : this.preference() as GlobalTheme;
    }
    setPreference(preference: 'system' | GlobalTheme): void {
        if (!['system', 'light', 'dark'].includes(preference)) {return;}
        this.preference.set(preference);
        this.activeTheme.set(this.resolveTheme());
        this.applyTheme();
        this.persist('gg-theme', preference);
    }

    /** Returns the selected shell appearance. */
    getTheme (): GlobalTheme {
        return this.theme();
    }

    /** Changes the shell appearance while preserving the game accent. */
    setTheme(theme: GlobalTheme): void {
        this.setPreference(theme);
    }

    /** Changes only the game context and accent. */
    setGame (game: GameTheme, color?: string): void {
        if (!GAME_THEMES.some(option => option.id === game)) {
            return;
        }
        this.activeGame.set(game);
        this.highlight = color ? normalizeGameColor(color) : null;
        this.applyTheme();
        this.persist("gg-game", game);
    }

    /** Toggles the shell between light and dark. */
    toggleTheme (): void {
        this.setTheme(this.theme() === "light" ? "dark" : "light");
    }

    /** Applies restored appearance and game preferences to the document. */
    initializeTheme (): void {
        this.applyTheme();
    }

    /** Restores a known game or the neutral application accent. */
    private readGame (): GameTheme {
        const saved = this.read("gg-game");
        return GAME_THEMES.find(option => option.id === saved)?.id ?? "default";
    }

    /** Reads a preference safely when browser storage is restricted. */
    private read (key: string): string | null {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    /** Persists a preference when browser storage is available. */
    private persist (key: string, value: string): void {
        try {
            localStorage.setItem(key, value);
        } catch {
            // Keep the session usable when browser storage is unavailable.
        }
    }

    /** Synchronizes the document and native control appearance. */
    private applyTheme (): void {
        const root = document.documentElement;
        root.classList.remove("theme-light", "theme-dark");
        root.classList.add(`theme-${this.theme()}`);
        root.dataset["theme"] = this.theme();
        root.dataset["game"] = this.game();
        root.style.colorScheme = this.theme();
        const channels = this.highlight ? gameColorChannels(this.highlight) : null;
        if (this.highlight && channels) {
            root.style.setProperty('--color-game-accent', this.highlight);
            const luminance = channels.map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
                .reduce((total, channel, index) => total + channel * [.2126, .7152, .0722][index], 0);
            root.style.setProperty('--color-on-primary', luminance > .179 ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 255, 255, 1)');
        } else {
            root.style.removeProperty('--color-game-accent');
            root.style.removeProperty('--color-on-primary');
        }
    }
}
