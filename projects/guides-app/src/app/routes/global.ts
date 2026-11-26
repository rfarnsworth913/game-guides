import { UrlMatcher } from "@angular/router";

const globalPages = new Set([
    "dashboard",
    "games",
    "events",
    "settings",
]);

export const globalWorkspaceManager: UrlMatcher = (segments) => {
    if(segments[0]?.path==='library' && (segments.length===1 || segments.length===2 && ['favorites','pinned','recent','manage'].includes(segments[1].path) || segments.length===3 && segments[1].path==='collections')) {
        return {consumed:segments,posParams:{page:segments[0]}};
    }
    if (segments.length !== 1 || !globalPages.has(segments[0].path)) {
        return null;
    }

    return {
        consumed: segments,
        posParams: { page: segments[0] }
    };
};
