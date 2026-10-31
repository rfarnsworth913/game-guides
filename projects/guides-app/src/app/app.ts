import { Component, inject, signal } from "@angular/core";
import { RouterOutlet } from "@angular/router";

import { AuthService } from "@auth0/auth0-angular";

import { ThemeService } from "./core/theme/theme.service";


@Component({
    selector: "gg-root",
    imports: [RouterOutlet],
    templateUrl: "./app.html",
    styleUrl: "./app.scss",
})
export class App {

    // Application title and theme service initialization
    private readonly themeService = inject(ThemeService);
    private readonly auth = inject(AuthService, { optional: true });      // Start callback handling before lazy workspace routes load.

    protected readonly title = signal("guides-app");

    constructor () {
        // Initialize theme when app loads
        this.themeService.initializeTheme();
    }
}
