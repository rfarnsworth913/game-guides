import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiDependencies } from '../../app/app.types';
import { handleGameImages } from './images.controller';

export async function imageRoutes(request: IncomingMessage, response: ServerResponse, url: URL, dependencies: ApiDependencies): Promise<boolean> {
    const match = /^\/api\/games\/([a-z]+)\/images(?:\/([^/]+))?$/.exec(url.pathname);
    if (!match) return false;
    if (request.method !== 'GET') await dependencies.security.requireEditor(request);
    await handleGameImages(request, response, match[1], match[2], dependencies.assetsRoot);
    return true;
}
