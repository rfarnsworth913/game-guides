import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiDependencies } from './app.types';
import { ApiError } from '../core/errors/app-error';
import { authRoutes } from '../modules/auth/auth.routes';
import { progressRoutes } from '../modules/progress/progress.routes';
import { imageRoutes } from '../modules/images/images.routes';
import { healthRoutes } from '../modules/health/health.routes';
import { gameRoutes } from '../modules/games/games.routes';
export async function dispatchRoutes(request: IncomingMessage, response: ServerResponse, url: URL, dependencies: ApiDependencies): Promise<void> {
    // Keep original precedence, including security handling before protected domain routes.
    for (const route of [authRoutes, progressRoutes, imageRoutes, healthRoutes, gameRoutes]) {
        if (await route(request, response, url, dependencies))
            return;
    }
    throw new ApiError(404, 'API route not found.');
}
