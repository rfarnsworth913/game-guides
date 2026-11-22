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

    // Initialize global services ---------------------------------------------
    private readonly auth = inject(AuthService, { optional: true });      // Start callback handling before lazy workspace routes load.
    private readonly themeService = inject(ThemeService);

    protected readonly title = signal("guides-app");


    // Initialize themes when the app loads -----------------------------------
    constructor () {
        this.themeService.initializeTheme();
    }
}
