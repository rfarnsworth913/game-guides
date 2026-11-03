import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiDependencies } from '../../app/app.types';

// Provider owns session responses; the legacy provider remains usable by regression tests.
export function authRoutes(request: IncomingMessage, response: ServerResponse, url: URL, dependencies: ApiDependencies): Promise<boolean> {
    return dependencies.security.handle(request, response, url);
}
