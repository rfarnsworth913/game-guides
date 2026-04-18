import { Routes } from "@angular/router";

export const routes: Routes = [
    {
        path: "gacha",
        loadComponent: async () => import("./pages/gacha/gacha").then(m => m.GachaPage)
    }
];
