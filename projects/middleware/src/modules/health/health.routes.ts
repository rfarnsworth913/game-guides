import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiDependencies } from '../../app/app.types';
import { respond } from '../../core/http/response';

export async function healthRoutes(request: IncomingMessage, response: ServerResponse, url: URL, dependencies: ApiDependencies): Promise<boolean> {
    if (request.method !== 'GET' || url.pathname !== '/api/health') {return false;}
    await dependencies.ping();
    respond(response, 200, { service: 'game-guides-middleware', database: 'connected' });
    return true;
}
