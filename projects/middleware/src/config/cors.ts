import type { IncomingMessage } from 'node:http';
import { ApiError } from '../core/errors/app-error';

export function assertOrigin(request: IncomingMessage, origins: string[]): void {
    if (request.headers.origin && !origins.includes(request.headers.origin)) {
        throw new ApiError(403, 'Origin is not allowed.');
    }
}
