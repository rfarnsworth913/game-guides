import { Routes } from '@angular/router';

export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    {
        path: 'gacha',
        redirectTo: 'dashboard',
        pathMatch: 'full',
    },
    {
        path: 'games/:game/:page',
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
