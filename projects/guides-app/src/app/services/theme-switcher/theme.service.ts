import { Injectable, signal } from "@angular/core";

import { GameTheme, GlobalTheme } from "@lib/types";

export const GAME_THEMES: ReadonlyArray<{ id: GameTheme; label: string }> = [
    { id: "default", label: "All games" },
    { id: "genshin", label: "Genshin Impact" },
    { id: "hsr", label: "Honkai: Star Rail" },
    { id: "zzz", label: "Zenless Zone Zero" },
    { id: "wuwa", label: "Wuthering Waves" },
    { id: "endfield", label: "Arknights: Endfield" },
];

@Injectable({ providedIn: "root" })
export class ThemeService {
    private readonly activeTheme = signal<GlobalTheme>(this.read("gg-theme") === "light" ? "light" : "dark");
    private readonly activeGame = signal<GameTheme>(this.readGame());

    readonly theme = this.activeTheme.asReadonly();
    readonly game = this.activeGame.asReadonly();

    /** Returns the selected shell appearance. */
    getTheme (): GlobalTheme {
        return this.theme();
    }

    /** Changes the shell appearance while preserving the game accent. */
    setTheme(theme: GlobalTheme): void {
        this.activeTheme.set(theme);
        this.applyTheme();
        this.persist("gg-theme", theme);
    }

    /** Changes only the game context and accent. */
    setGame (game: GameTheme): void {
        if (!GAME_THEMES.some(option => option.id === game)) {
            return;
        }
        this.activeGame.set(game);
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
    }
}
