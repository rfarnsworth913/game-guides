import { Routes, UrlMatcher } from '@angular/router';

/** One route keeps the workspace mounted when a section path is added or changed. */
export const gameWorkspaceMatcher: UrlMatcher = (segments) => {
    const offset = segments[0]?.path === 'games' ? 1 : 0;
    const count = segments.length - offset;
    if (count < 2 || count > 3) return null;
    return { consumed: segments, posParams: { game: segments[offset], page: segments[offset + 1],
        ...(count === 3 ? { section: segments[offset + 2] } : {}) } };
};

export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    {
        path: 'gacha',
        redirectTo: 'dashboard',
        pathMatch: 'full',
    },
    {
        matcher: gameWorkspaceMatcher,
        loadComponent: async () => import('./workspace/workspace').then((m) => m.Workspace),
    },
    ...[
        'inventory',
        'characters',
        'teams',
        'plans',
        'story',
        'farming',
        'events',
        'achievements',
    ].map((path) => ({
        path,
        redirectTo: 'games',
        pathMatch: 'full' as const,
    })),
    {
        path: ':page',
        loadComponent: async () => import('./workspace/workspace').then((m) => m.Workspace),
    },
    { path: '**', redirectTo: 'dashboard' },
];
