import { UrlMatcher } from "@angular/router";

const globalPages = new Set([
    "dashboard",
    "games",
    "events",
    "settings",
]);

export const globalWorkspaceManager: UrlMatcher = (segments) => {
    if (segments.length !== 1 || !globalPages.has(segments[0].path)) {
        return null;
    }

    return {
        consumed: segments,
        posParams: { page: segments[0] }
    };
};
