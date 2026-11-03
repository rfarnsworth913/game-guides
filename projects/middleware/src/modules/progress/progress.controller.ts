import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AccountProgressRepository, CatalogRepository } from '../../app/app.types';
import { jsonBody } from '../../core/http/request-body';
import { respond } from '../../core/http/response';
import { ProgressService } from './progress.service';

export async function progressController(request: IncomingMessage, response: ServerResponse, userId: string, repository: CatalogRepository, progress: AccountProgressRepository): Promise<void> {
    if (request.method === 'GET') {
        respond(response, 200, await progress.read(userId));
        return;
    }
    const body = await jsonBody(request);
    respond(response, 200, await new ProgressService(repository, progress).patch(userId, body));
}
