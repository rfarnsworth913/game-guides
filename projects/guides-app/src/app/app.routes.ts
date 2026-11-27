import { Routes } from "@angular/router";

import { featureWorkspaceMatcher, globalWorkspaceManager } from "./routes";
import { gameWorkspaceGuard } from './core/auth/game-workspace.guard';


export const routes: Routes = [

    // Temporary Redirect to dashboard for the root path ----------------------
    {
        path: "",
        pathMatch: "full",
        redirectTo: "dashboard"
    },

    // Content Routes ---------------------------------------------------------
    {
        matcher: globalWorkspaceManager,
        loadComponent: async () => import("./layouts/main-layout/workspace").then(m => m.Workspace),
    },

    {
        matcher: featureWorkspaceMatcher,
        canActivate: [gameWorkspaceGuard],
        runGuardsAndResolvers: 'paramsChange',
        loadComponent: async () => import("./layouts/main-layout/workspace").then(m => m.Workspace),
    },

    {
        path: "error",
        loadComponent: async () => import("./features/global/errors/error-page").then(m => m.ErrorPage)
    },

    {
        path: "**",
        loadComponent: async () => import("./features/global/errors/not-found-page").then(m => m.NotFoundPage)
    },
];
