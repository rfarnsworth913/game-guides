import { lockedSecurity, Security } from './auth';
import { ProgressRepository } from './progress';
import { validProgressState } from '../../common/player-progress';
import { characterCollectionFits, validCharacterRules } from '../../common/characters';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { GAMES, validCatalog, fromCatalog } from '../../common/workspace';
import { storyCompletionKey } from '../../common/story-guide';
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
    security: Security = lockedSecurity,
    progress?: Pick<ProgressRepository, 'read' | 'patch'>,
) {
    const respond = (response: ServerResponse, status: number, body: unknown) => {
        if (status === 429) response.setHeader('Retry-After', '60');
        response.writeHead(status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        });
        response.end(JSON.stringify(body));
    };
    const limits = new Map<string, { count: number; reset: number }>();
    const rateLimit = (request: IncomingMessage, auth: boolean) => {
        const key = (request.socket.remoteAddress ?? 'unknown') + (auth ? '/auth' : '/write');
        const now = Date.now();
        for (const [id, item] of limits) if (item.reset < now) limits.delete(id);
        const item = limits.get(key) ?? { count: 0, reset: now + 60000 };
        if (limits.size >= 10000 && !limits.has(key)) throw new ApiError(429, 'Too many requests. Try again later.');
        if (++item.count > (auth ? 30 : 180)) throw new ApiError(429, 'Too many requests. Try again later.');
        limits.set(key, item);
    };
    const server = createServer((request, response) => {
        const handle = async () => {
            const url = new URL(request.url ?? '/', 'http://localhost');
            const path = url.pathname;
            response.setHeader('X-Content-Type-Options', 'nosniff');
            response.setHeader('Referrer-Policy', 'same-origin');
            if (path.startsWith('/api/auth/') && path !== '/api/auth/session') rateLimit(request, true);
            else if (!['GET', 'HEAD'].includes(request.method ?? '')) rateLimit(request, false);
            if (request.headers.origin && !origins.includes(request.headers.origin)) {
                throw new ApiError(403, 'Origin is not allowed.');
            }
            if (await security.handle(request, response, url)) return;
            if (path === '/api/me/progress') {
                if (!['GET', 'PATCH'].includes(request.method ?? '')) throw new ApiError(405, 'Method not allowed.');
                const user = await security.requireUser(request, request.method === 'PATCH');
                if (!progress) throw new ApiError(503, 'Account progress unavailable.');
                if (request.method === 'GET') { respond(response, 200, await progress.read(user.id)); return; }
                const body = await jsonBody(request);
                if (!body || typeof body !== 'object' || Object.keys(body).some((key) => !['revision', 'changes'].includes(key)) ||
                    !('revision' in body) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0 ||
                    !('changes' in body) || !validProgressState(body.changes)) throw new ApiError(400, 'Invalid progress update.');
                const previous = await progress.read(user.id);
                if (previous.revision !== body.revision) throw new ApiError(409, 'Progress changed in another browser. Reload before retrying.');
                const catalogs = new Map<string, Map<string, Awaited<ReturnType<typeof repository.read>>['entries'][number]>>();
                const gameRules = new Map<string, Awaited<ReturnType<typeof repository.read>>['characterRules']>();
                for (const [key, state] of Object.entries(body.changes)) {
                    const slash = key.indexOf('/'); const game = key.slice(0, slash); const id = key.slice(slash + 1);
                    if (!catalogs.has(game)) {
                        const snapshot = await repository.read(game);
                        catalogs.set(game, new Map(snapshot.entries.map((entry) => [entry.id, entry])));
                        gameRules.set(game, snapshot.characterRules);
                    }
                    const entry = catalogs.get(game)!.get(id);
                    if (!entry) throw new ApiError(400, 'Progress references unknown content.');
                    if (state.characterCollection) {
                        const rules = gameRules.get(game);
                        if (entry.kind !== 'characters' || (state.characterCollection.owned && (!rules || !characterCollectionFits(state.characterCollection, rules)))) {
                            throw new ApiError(400, 'Character level, equipment, or progression does not match this game\'s rules.');
                        }
                    }
                    const rows = [entry.patchOverview, entry.mainStory, entry.sideStories, entry.worldQuests, entry.lore, entry.eventStory, entry.characterInformation]
                        .flatMap((template) => template?.rows ?? []).filter((row) => !row.rowType || row.rowType === 'quest');
                    const definition = fromCatalog(entry);
                    const rowIds = new Set(rows.flatMap(row => [row.id, storyCompletionKey(definition, row)].filter((id): id is string => id !== null)));
                    const history = previous.state[key]?.storyRowCompletion ?? {};
                    // Template edits can retire rows or promote them to headings. Preserve existing
                    // private history, but do not allow new or changed unknown completion keys.
                    if (Object.entries(state.storyRowCompletion ?? {}).some(([id, value]) => !rowIds.has(id) &&
                        !(Object.hasOwn(history, id) && history[id] === value))) throw new ApiError(400, 'Progress references unknown rows.');
                }
                respond(response, 200, await progress.patch(user.id, Number(body.revision), body.changes)); return;
            }
            const imageMatch = /^\/api\/games\/([a-z]+)\/images(?:\/([^/]+))?$/.exec(path);
            if (imageMatch) {
                if (request.method !== 'GET') await security.requireEditor(request);
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
            await security.requireEditor(request);
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
            if ('characterRules' in body && !validCharacterRules(body.characterRules)) throw new ApiError(400, 'Invalid character rules.');
            respond(response, 200, await repository.write(id, body.entries, Number(body.revision), 'characterRules' in body ? body.characterRules as import('../../common/characters').CharacterRules : undefined));
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
