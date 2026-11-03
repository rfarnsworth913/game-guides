import { Routes, UrlMatcher } from "@angular/router";


/**
 * Recognizes game workspace URLs and extracts their parts into route parameters.
 *
 * The main reason for this matcher is keeping all these URL variations on one route definition. Switching from inazuma to mondstadt updates
 * the parameters while keeping the workspace component mounted. Your routing test explicitly verifies that behavior.
 *
 * It checks the URL’s shape, not whether the game, page, or section actually exists; those values are handled elsewhere in the app.
 *
 * @param segments - The URL segments to match against the game workspace pattern.
 * @returns        An object containing the consumed segments and positional parameters if the URL matches the pattern, or null if it doesn't match.
 */
export const gameWorkspaceMatcher: UrlMatcher = (segments) => {

    // Optional prefix "games" in the URL
    const offset = segments[0]?.path === "games" ? 1 : 0;
    const count = segments.length - offset;

    if (count < 2 || count > 3) {
        return null;
    }

    return {
        consumed: segments,
        posParams: {
            game: segments[offset],
            page: segments[offset + 1],
            ...count === 3 ? { section: segments[offset + 2] } : {}
        }
    };
};


export const routes: Routes = [

    // Temporary Redirect to dashboard for the root path ----------------------
    // Replace if extending in multiple primary sections (games vs. gacha)
    {
        path: "",
        pathMatch: "full",
        redirectTo: "dashboard"
    },

    // Gacha routes -----------------------------------------------------------
    {
        path: "gacha",
        redirectTo: "dashboard",
        pathMatch: "full",
    },

    {
        matcher: gameWorkspaceMatcher,
        loadComponent: async () => import("./layouts/main-layout/workspace").then(m => m.Workspace),
    },

    ...[
        "achievements",
        "characters",
        "inventory",
        "events",
        "farming",
        "plans",
        "story",
        "teams",
    ].map(path => ({
        path,
        redirectTo: "games",
        pathMatch: "full" as const,
    })),

    {
        path: ":page",
        loadComponent: async () => import("./layouts/main-layout/workspace").then(m => m.Workspace),
    },

    {
        path: "**",
        redirectTo: "dashboard"
    },
];
