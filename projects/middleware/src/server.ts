import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { GAMES, validCatalog } from '../../common/workspace';
import { ApiError, GameRepository } from './repository';
import { handleGameImages, imageRoot } from './game-images';

async function jsonBody(request: IncomingMessage): Promise<unknown> {
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
    } catch {
        throw new ApiError(400, 'Invalid JSON.');
    }
}
export function createApi(
    repository: Pick<GameRepository, 'read' | 'write' | 'parsed'>,
    origins: string[],
    ping: () => Promise<unknown>,
    assetsRoot = imageRoot,
) {
    const respond = (response: ServerResponse, status: number, body: unknown) => {
        response.writeHead(status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        });
        response.end(JSON.stringify(body));
    };
    const server = createServer((request, response) => {
        const handle = async () => {
            const path = new URL(request.url ?? '/', 'http://localhost').pathname;
            if (request.headers.origin && !origins.includes(request.headers.origin)) {
                throw new ApiError(403, 'Origin is not allowed.');
            }
            const imageMatch = /^\/api\/games\/([a-z]+)\/images(?:\/([^/]+))?$/.exec(path);
            if (imageMatch) {
                await handleGameImages(request, response, imageMatch[1], imageMatch[2], assetsRoot);
                return;
            }
            if (request.method === 'GET' && path === '/api/health') {
                await ping();
                respond(response, 200, {
                    service: 'game-guides-middleware',
                    database: 'connected',
                });
                return;
            }
            if (request.method === 'GET' && path === '/api/games') {
                respond(response, 200, {
                    games: await Promise.all(GAMES.map((game) => repository.read(game.id))),
                });
                return;
            }
            const match = /^\/api\/games\/([a-z]+)(?:\/(catalog|parsed))?$/.exec(path);
            if (!match) {
                throw new ApiError(404, 'API route not found.');
            }
            const id = match[1];
            if (!GAMES.some((g) => g.id === id)) {
                throw new ApiError(404, 'Unknown game.');
            }
            if (request.method === 'GET') {
                respond(
                    response,
                    200,
                    match[2] === 'parsed' ? await repository.parsed(id) : await repository.read(id),
                );
                return;
            }
            if (request.method !== 'PUT' || match[2] !== 'catalog') {
                throw new ApiError(405, 'Method not allowed.');
            }
            const body = await jsonBody(request);
            if (
                !body ||
                typeof body !== 'object' ||
                !('revision' in body) ||
                !Number.isSafeInteger(body.revision) ||
                Number(body.revision) < 0 ||
                !('entries' in body) ||
                !validCatalog(body.entries, id)
            ) {
                throw new ApiError(
                    400,
                    'Invalid catalog, references, or revision. Player state must not be sent to the server.',
                );
            }
            respond(response, 200, await repository.write(id, body.entries, Number(body.revision)));
        };
        handle().catch((error: unknown) => {
            const known = error instanceof ApiError;
            if (!known) {
                console.error('Database request failed:', error instanceof Error ? error.name : 'Unknown error');
            }
            if (!response.headersSent) {
                respond(response, known ? error.status : 503, {
                    error: known ? error.message : 'Database unavailable. Please retry.',
                });
            } else {
                response.end();
            }
        });
    });
    server.requestTimeout = 15000;
    return server;
}
