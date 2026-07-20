import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";

import { Theme } from "@lib/types";
import { ThemeService } from "../../services/theme-switcher/theme.service";

@Component({
    selector: "gg-theme-switcher",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./theme-switcher.html",
    styleUrl: "./theme-switcher.scss",
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeSwitcherComponent {

    // Internal Properties ----------------------------------------------------
    private readonly themeService = inject(ThemeService);


    // Handlers ---------------------------------------------------------------

    /**
     * Gets the current theme from the ThemeService.
     */
    get currentTheme (): Theme {
        return this.themeService.getTheme();
    }

    /**
     * Toggles the current theme using the ThemeService.
     */
    toggleTheme (): void {
        this.themeService.toggleTheme();
    }
}
