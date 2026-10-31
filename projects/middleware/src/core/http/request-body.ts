import type { IncomingMessage } from 'node:http';
import { ApiError } from '../errors/app-error';
export async function jsonBody(request: IncomingMessage): Promise<unknown> {
    if (!request.headers['content-type']?.startsWith('application/json')) {
        throw new ApiError(415, 'Use application/json.');
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
        size += Buffer.byteLength(chunk);
        if (size > 8 * 1024 * 1024) {
            throw new ApiError(413, 'Request is too large.');
        }
        chunks.push(Buffer.from(chunk));
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    }
    catch {
        throw new ApiError(400, 'Invalid JSON.');
    }
}
