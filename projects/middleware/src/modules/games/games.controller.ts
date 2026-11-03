import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CatalogRepository } from '../../app/app.types';
import { GAMES } from '../../../../lib/constants/workspace.constants';
import { jsonBody } from '../../core/http/request-body';
import { respond } from '../../core/http/response';
import { GamesService } from './games.service';

export async function allGamesController(response: ServerResponse, repository: CatalogRepository): Promise<void> {
    respond(response, 200, { games: await Promise.all(GAMES.map(game => repository.read(game.id))) });
}
export async function readGameController(response: ServerResponse, repository: CatalogRepository, id: string, parsed: boolean): Promise<void> {
    respond(response, 200, parsed ? await repository.parsed(id) : await repository.read(id));
}
export async function writeGameController(request: IncomingMessage, response: ServerResponse, repository: CatalogRepository, id: string): Promise<void> {
    respond(response, 200, await new GamesService(repository).write(id, await jsonBody(request)));
}
