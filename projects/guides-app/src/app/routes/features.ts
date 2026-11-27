import { UrlMatcher } from "@angular/router";


const featurePages = new Set([
    "dashboard",
    "achievements",
    "characters",
    "events",
    "farming",
    "inventory",
    "plans",
    "story",
    "teams"
]);


export const featureWorkspaceMatcher: UrlMatcher = (segments) => {
    const offset = segments[0]?.path === "games" ? 1 : 0;
    const count = segments.length - offset;

    if (count !== 2 && count !== 3) {
        return null;
    }

    const game = segments[offset];
    const page = segments[offset + 1];

    if (!featurePages.has(page.path)) {
        return null;
    }

    if (count === 3 && page.path !== "story") {
        return null;
    }

    return {
        consumed: segments,
        posParams: {
            game,
            page,
            ...count === 3 ? { section: segments[offset + 2] } : {},
        },
    };
};
