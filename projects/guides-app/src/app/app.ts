import { Component, inject, signal } from "@angular/core";
import { RouterOutlet } from "@angular/router";

import { ThemeService } from "./services/theme-switcher/theme.service";
import { AuthService } from '@auth0/auth0-angular';

@Component({
    selector: "gg-root",
    imports: [RouterOutlet],
    templateUrl: "./app.html",
    styleUrl: "./app.scss",
})
export class App {
    protected readonly title = signal("guides-app");
    private readonly themeService = inject(ThemeService);
    // Start callback handling before lazy workspace routes load.
    private readonly auth = inject(AuthService, { optional: true });

    constructor () {
        // Initialize theme when app loads
        this.themeService.initializeTheme();
    }
}
