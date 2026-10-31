import type { Security } from './auth.types';
import { ApiError } from '../errors/app-error';

export const lockedSecurity: Security = {
    async handle(request, response, url) {
        if (url.pathname === '/api/auth/session' && request.method === 'GET') {
            response.setHeader('Content-Type', 'application/json');
            response.setHeader('Cache-Control', 'no-store');
            response.end(JSON.stringify({ configured: false, user: null, csrf: null }));
            return true;
        }
        if (url.pathname.startsWith('/api/auth/')) {
            throw new ApiError(503, 'Sign-in is not configured.');
        }
        return false;
    },
    async requireUser() {
        throw new ApiError(401, 'Sign in to continue.');
    },
    async requireEditor() {
        throw new ApiError(401, 'Sign in with an editor account.');
    },
};
