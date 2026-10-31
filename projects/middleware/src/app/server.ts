import { createServer } from 'node:http';
import type { Security } from '../core/auth/auth.types';
import { lockedSecurity } from '../core/auth/auth.middleware';
import { assertOrigin } from '../config/cors';
import { createRateLimiter } from '../core/http/rate-limit';
import { handleApiError } from '../core/errors/error-handler';
import { imageRoot } from '../modules/images/images.repository';
import { dispatchRoutes } from './routes';
import type { AccountProgressRepository, CatalogRepository } from './app.types';
export function createApi(repository: CatalogRepository, origins: string[], ping: () => Promise<unknown>, assetsRoot = imageRoot, security: Security = lockedSecurity, progress?: AccountProgressRepository) {
    const rateLimit = createRateLimiter();
    const dependencies = { repository, security, progress, ping, assetsRoot };
    const server = createServer((request, response) => {
        const handle = async () => {
            const url = new URL(request.url ?? '/', 'http://localhost');
            const path = url.pathname;
            response.setHeader('X-Content-Type-Options', 'nosniff');
            response.setHeader('Referrer-Policy', 'same-origin');
            if (path.startsWith('/api/auth/') && path !== '/api/auth/session')
                rateLimit(request, true);
            else if (!['GET', 'HEAD'].includes(request.method ?? ''))
                rateLimit(request, false);
            assertOrigin(request, origins);
            await dispatchRoutes(request, response, url, dependencies);
        };
        handle().catch((error: unknown) => handleApiError(response, error));
    });
    server.requestTimeout = 15000;
    return server;
}
