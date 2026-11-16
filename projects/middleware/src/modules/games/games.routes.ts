import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiDependencies } from '../../app/app.types';
import { ApiError } from '../../core/errors/app-error';
import { GAMES } from '../../../../lib/constants/workspace.constants';
import { allGamesController, readGameController, writeGameController } from './games.controller';
import { jsonBody } from '../../core/http/request-body';
import { respond } from '../../core/http/response';
import { validGameId } from '../../../../common/workspace/game-overview';

export async function gameRoutes(request: IncomingMessage, response: ServerResponse, url: URL, dependencies: ApiDependencies): Promise<boolean> {
    const repository = dependencies.repository;
    if (url.pathname === '/api/games/registry' || (url.pathname === '/api/games' && request.method === 'POST')) {
        if (request.method === 'GET' && url.pathname === '/api/games/registry') {
            const user = await dependencies.security.requireUser(request);
            if (!user.editor) {throw new ApiError(403, 'An editor account is required.');}
        } else {await dependencies.security.requireEditor(request);}
        if (!repository.list || !repository.saveOverview) {throw new ApiError(503, 'Game management is unavailable.');}
        if (request.method === 'GET' && url.pathname.endsWith('/registry')) {respond(response, 200, { games: await repository.list(true) });}
        else if (request.method === 'POST' && url.pathname === '/api/games') {respond(response, 201, await repository.saveOverview(await jsonBody(request), true));}
        else {throw new ApiError(405, 'Method not allowed.');}
        return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/games') {
        await allGamesController(response, dependencies.repository);
        return true;
    }
    const match = /^\/api\/games\/([a-z][a-z0-9-]*)(?:\/(catalog|parsed|overview))?$/.exec(url.pathname);
    if (!match) {return false;}
    const id = match[1];
    if (!validGameId(id) || (!repository.list && !GAMES.some(game => game.id === id))) {throw new ApiError(404, 'Unknown game.');}
    if ((request.method === 'PUT' && match[2] === 'overview') || (request.method === 'DELETE' && !match[2])) {
        await dependencies.security.requireEditor(request);
        if (!repository.saveOverview || !repository.archive) {throw new ApiError(503, 'Game management is unavailable.');}
        const body = await jsonBody(request);
        if (request.method === 'DELETE') {
            if (!body || typeof body !== 'object' || !('revision' in body) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0) {throw new ApiError(400, 'Invalid revision.');}
            respond(response, 200, await repository.archive(id, Number(body.revision)));
        } else {
            if (!body || typeof body !== 'object' || !('id' in body) || body.id !== id) {throw new ApiError(400, 'Game ID must match the URL.');}
            respond(response, 200, await repository.saveOverview(body));
        }
        return true;
    }
    if (request.method === 'GET') {
        await readGameController(response, dependencies.repository, id, match[2] === 'parsed');
        return true;
    }
    if (request.method !== 'PUT' || match[2] !== 'catalog') {throw new ApiError(405, 'Method not allowed.');}
    await dependencies.security.requireEditor(request);
    await writeGameController(request, response, dependencies.repository, id);
    return true;
}
