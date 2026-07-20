import { Injectable, signal } from "@angular/core";

import { Theme } from "@lib/types";

@Injectable({
    providedIn: "root"
})
export class ThemeService {

    // Internal properties ----------------------------------------------------
    private readonly themeID = "gg-theme";
    private readonly activeTheme = signal<Theme>(this.getInitialTheme());


    // Public API -------------------------------------------------------------

    /**
     * Get the current theme
     */
    getTheme (): Theme {
        return this.activeTheme();
    }

    /**
     * Set the theme and persist to localStorage
     *
     * @param theme - The theme to be set (light or dark)
     */
    setTheme (theme: Theme): void {
        this.activeTheme.set(theme);
        this.applyTheme(theme);
        localStorage.setItem("gg-theme", theme);
    }

    /**
     * Toggle between light and dark themes
     */
    toggleTheme (): void {
        const currentTheme = this.activeTheme();
        const newTheme: Theme = currentTheme === "light" ? "dark" : "light";
        this.setTheme(newTheme);
    }

    /**
     * Initialize theme from localStorage or system preference
     */
    initializeTheme (): void {
        const theme = this.getInitialTheme();
        this.activeTheme.set(theme);
        this.applyTheme(theme);
    }


    // Internal Theme Handling ------------------------------------------------

    /**
     * Get initial theme from localStorage or system preference
     */
    private getInitialTheme (): Theme {
        // Check localStorage first
        const saved = localStorage.getItem(this.themeID) as Theme | null;
        if (saved && (saved === "light" || saved === "dark")) {
            return saved;
        }

        // Check system preference
        if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
            return "dark";
        }

        // Default to light
        return "light";
    }

    /**
     * Apply theme by setting class on root element and applying CSS custom properties
     */
    private applyTheme (theme: Theme): void {
        const root = document.documentElement;
        const oppositeTheme: Theme = theme === "light" ? "dark" : "light";

        root.classList.remove(`theme-${oppositeTheme}`);
        root.classList.add(`theme-${theme}`);
        root.setAttribute("data-theme", theme);
    }
}
