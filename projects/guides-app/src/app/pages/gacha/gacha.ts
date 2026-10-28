import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

import { Header } from "../../common/header/header";
import { Sidebar } from "./sidebar/sidebar";


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
