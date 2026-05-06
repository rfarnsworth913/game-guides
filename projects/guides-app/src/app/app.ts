import { Component, inject, signal } from "@angular/core";
import { RouterOutlet } from "@angular/router";

import { ThemeService } from "./services/theme.service";

@Component({
    selector: "gg-root",
    imports: [RouterOutlet],
    templateUrl: "./app.html",
    styleUrl: "./app.scss",
})
export class App {
    protected readonly title = signal("guides-app");
    private readonly themeService = inject(ThemeService);

    constructor () {
        // Initialize theme when app loads
        this.themeService.initializeTheme();
    }
}
