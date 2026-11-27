import { Component, HostListener, inject, signal } from "@angular/core";
import { RouterOutlet } from "@angular/router";

import { AuthService } from "@auth0/auth0-angular";

import { ThemeService } from "./core/theme/theme.service";
import { GameSwitcher } from './shared/components/game-switcher/game-switcher';
import { GameSwitcherControl } from './core/state/game-switcher-control';


@Component({
    selector: "gg-root",
    imports: [RouterOutlet,GameSwitcher],
    templateUrl: "./app.html",
    styleUrl: "./app.scss",
})
export class App {
    readonly switcher=inject(GameSwitcherControl);
    @HostListener('document:keydown',['$event']) shortcut(event:KeyboardEvent):void {
        if(!event.defaultPrevented && (event.ctrlKey||event.metaKey) && !event.altKey && event.key.toLowerCase()==='k') {event.preventDefault();this.switcher.open();}
    }

    // Initialize global services ---------------------------------------------
    private readonly auth = inject(AuthService, { optional: true });      // Start callback handling before lazy workspace routes load.
    private readonly themeService = inject(ThemeService);

    protected readonly title = signal("guides-app");


    // Initialize themes when the app loads -----------------------------------
    constructor () {
        this.themeService.initializeTheme();
    }
}
