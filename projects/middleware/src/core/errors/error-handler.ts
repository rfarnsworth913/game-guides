import type { ServerResponse } from 'node:http';
import { ApiError } from './app-error';
import { respond } from '../http/response';
export function handleApiError(response: ServerResponse, error: unknown): void {
    const known = error instanceof ApiError;
    if (!known) {
        console.error('Database request failed:', error instanceof Error ? error.name : 'Unknown error');
    }
    if (!response.headersSent) {
        respond(response, known ? error.status : 503, {
            error: known ? error.message : 'Database unavailable. Please retry.',
        });
    }
    else {
        response.end();
    }
}
