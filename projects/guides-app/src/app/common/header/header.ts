import { Component } from "@angular/core";
import { ThemeSwitcherComponent } from "../theme-switcher/theme-switcher";

@Component({
  selector: "gg-header",
  imports: [ThemeSwitcherComponent],
  templateUrl: "./header.html",
  styleUrl: "./header.scss",
})
export class Header {}
