import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiDependencies } from '../../app/app.types';
import { ApiError } from '../../core/errors/app-error';
import { GAMES } from '../../../../lib/constants/workspace.constants';
import { allGamesController, readGameController, writeGameController } from './games.controller';

export async function gameRoutes(request: IncomingMessage, response: ServerResponse, url: URL, dependencies: ApiDependencies): Promise<boolean> {
    if (request.method === 'GET' && url.pathname === '/api/games') {
        await allGamesController(response, dependencies.repository);
        return true;
    }
    const match = /^\/api\/games\/([a-z]+)(?:\/(catalog|parsed))?$/.exec(url.pathname);
    if (!match) {return false;}
    const id = match[1];
    if (!GAMES.some(game => game.id === id)) {throw new ApiError(404, 'Unknown game.');}
    if (request.method === 'GET') {
        await readGameController(response, dependencies.repository, id, match[2] === 'parsed');
        return true;
    }
    if (request.method !== 'PUT' || match[2] !== 'catalog') {throw new ApiError(405, 'Method not allowed.');}
    await dependencies.security.requireEditor(request);
    await writeGameController(request, response, dependencies.repository, id);
    return true;
}
