/** @deprecated Legacy alternate layout; main-layout/workspace is the active shell. */
import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

import { Header } from "../../shared/components/header/header";
import { Sidebar } from "./components/sidebar/sidebar";


@Component({
    selector: "gg-gacha",
    imports: [
        Header,
        Sidebar,
        RouterOutlet
    ],
    templateUrl: "./gacha.html",
    styleUrls: ["./gacha.scss"]
})
/** @deprecated Legacy alternate layout. Use main-layout/workspace. */
export class GachaPage {

}
