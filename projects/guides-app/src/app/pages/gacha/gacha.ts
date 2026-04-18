import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

import { Header } from "../../common/header/header.js";
import { Sidebar } from "./sidebar/sidebar.js";

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
export class GachaPage {

}
