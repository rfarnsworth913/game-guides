import { inject, Injector } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { RequestError } from '../state/services/workspace-api';

/** Protect workspace navigation; public catalog/global views retain their public data access. */
export const gameWorkspaceGuard: CanActivateFn = async route => {
    const injector = inject(Injector);
    const router = inject(Router);
    const id = route.paramMap.get('game');
    if (!id) {return true;}
    const { WorkspaceStore } = await import('../state/workspace.store');
    const store = injector.get(WorkspaceStore);
    if (!store.initialized() && !await store.initialize()) {return router.parseUrl('/dashboard');}
    try {
        await store.authorizeGameWorkspace(id, route.paramMap.get('page') ?? 'dashboard');
        return true;
    } catch (error) {
        const game = store.games?.().find(game => game.gameId === id);
        const fallback = game && (game.visibility === 'public' || store.canEdit()) ? `/games/${id}/dashboard` : '/games';
        return router.parseUrl(error instanceof RequestError && [401, 403, 404].includes(error.status) ? fallback : '/error');
    }
};
