/** @deprecated Legacy alternate layout; main-layout/workspace is the active shell. */
import { Component, inject } from "@angular/core";
import { ThemeService } from "../../../../core/theme/theme.service";
import { GAME_THEMES } from "../../../../games/registry/game-themes";

@Component({
    selector: "gg-gacha-sidebar",
    templateUrl: "./sidebar.html",
    styleUrls: ["./sidebar.scss"],
})
/** @deprecated Legacy alternate layout. Use main-layout/workspace. */
export class Sidebar {
    readonly themes = inject(ThemeService);
    readonly games = GAME_THEMES;

    /** Applies a known game selected from the menu. */
    selectGame (value: string): void {
        const game = this.games.find(option => option.id === value);
        if (game) {
            this.themes.setGame(game.id);
        }
    }
}
