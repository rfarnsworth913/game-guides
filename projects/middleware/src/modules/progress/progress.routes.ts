import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiDependencies } from '../../app/app.types';
import { ApiError } from '../../core/errors/app-error';
import { progressController } from './progress.controller';

export async function progressRoutes(request: IncomingMessage, response: ServerResponse, url: URL, dependencies: ApiDependencies): Promise<boolean> {
    if (url.pathname !== '/api/me/progress') return false;
    if (!['GET', 'PATCH'].includes(request.method ?? '')) throw new ApiError(405, 'Method not allowed.');
    const user = await dependencies.security.requireUser(request, request.method === 'PATCH');
    if (!dependencies.progress) throw new ApiError(503, 'Account progress unavailable.');
    await progressController(request, response, user.id, dependencies.repository, dependencies.progress);
    return true;
}
