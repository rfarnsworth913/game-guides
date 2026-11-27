import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiDependencies } from '../../app/app.types';
import type { PlayerState } from '@lib/types/workspace.type';
import type { DashboardEvents, DashboardSummary } from '@lib/types/dashboard.type';
import { ApiError } from '../../core/errors/app-error';
import { jsonBody } from '../../core/http/request-body';
import { respond } from '../../core/http/response';
import { canAccessGame, canAccessFeature } from '@common/workspace/game-overview';
import { validProgressState } from '@common/player/player-progress';
import { dashboardGame, dashboardEntries } from '@common/dashboard/dashboard-summary';
import { eventBoundary } from '@common/events/event-dates';
import type { StoryPosition } from '@common/dashboard/story-dashboard';
import { validProgressDates } from '@common/player/progress-activity';

/** Read-only POST accepts device-local guest progress and reading positions without persisting either. */
export async function dashboardRoutes(request: IncomingMessage, response: ServerResponse, url: URL, dependencies: ApiDependencies): Promise<boolean> {
    const match = /^\/api\/dashboard\/(summary|events)(?:\/([a-z][a-z0-9-]*))?$/.exec(url.pathname);
    if (!match) {return false;}
    if (request.method !== 'POST') {throw new ApiError(405, 'Method not allowed.');}
    if (!dependencies.repository.list) {throw new ApiError(503, 'Dashboard unavailable.');}
    const user = request.headers.authorization ? await dependencies.security.requireUser(request) : null;
    const body = await jsonBody(request) as { state?: unknown; positions?: Record<string, StoryPosition>; gameUpdatedAt?: unknown } | null;
    if (!body || typeof body !== 'object' || Array.isArray(body) || (body.state !== globalThis.undefined && !validProgressState(body.state, null))) {throw new ApiError(400, 'Invalid dashboard request.');}
    const positions = body.positions ?? {};
    if (!positions || typeof positions !== 'object' || Array.isArray(positions) || Object.keys(positions).length > 1000 || Object.values(positions).some(position =>
        !position || typeof position.entryId !== 'string' || position.entryId.length > 500 || !Number.isFinite(position.visitedAt) ||
        (position.rowId !== globalThis.undefined && typeof position.rowId !== 'string'))) {throw new ApiError(400, 'Invalid reading positions.');}
    if (user && !dependencies.progress) {throw new ApiError(503, 'Account progress unavailable.');}
    const personal = user ? await dependencies.progress!.read(user.id) : { state: body.state as Record<string, PlayerState> ?? {},
        gameUpdatedAt: validProgressDates(body.gameUpdatedAt) ? body.gameUpdatedAt : {} };
    const player = personal.state;
    const registry = await dependencies.repository.list();
    const games = registry.filter(game => (!match[2] || game.gameId === match[2]) && canAccessGame(game, user?.editor ?? false));
    if (match[2] && !games.length) {throw new ApiError(404, 'Game workspace unavailable.');}
    const summary: DashboardSummary = { games: [], errors: [], generatedAt: new Date().toISOString() };
    const events: DashboardEvents = { entries: [], errors: summary.errors };
    // Bound database concurrency as the library grows. Failures affect only the relevant game.
    for (let index = 0; index < games.length; index += 4) {
        await Promise.all(games.slice(index, index + 4).map(async game => {
            if (match[1] === 'events' && !canAccessFeature(game, 'events', user?.editor ?? false)) {return;}
            try {
                const snapshot = await dependencies.repository.read(game.gameId);
                if (!snapshot.overview || !canAccessGame(snapshot.overview, user?.editor ?? false) ||
                    (match[1] === 'events' && !canAccessFeature(snapshot.overview, 'events', user?.editor ?? false))) {return;}
                if (match[1] === 'summary') {
                    // Version is metadata; never fetch the parsed catalog into the browser.
                    let version: { title?: string; versionNumber?: number } | undefined;
                    try {
                        const parsed = await dependencies.repository.parsed(game.gameId);
                        version = parsed['version'] as typeof version;
                    } catch { /* Optional patch metadata must not hide personal summaries. */ }
                    const result = dashboardGame(snapshot, player, user?.editor ?? false, positions[game.gameId], version?.versionNumber ? String(version.versionNumber) : globalThis.undefined);
                    const updatedAt = personal.gameUpdatedAt?.[game.gameId];
                    if (updatedAt) {result.progressUpdatedAt = updatedAt;}
                    if (version?.title || version?.versionNumber) {result.version = version.title || String(version.versionNumber);}
                    if (version?.versionNumber) {result.versionNumber = String(version.versionNumber);}
                    summary.games.push(result);
                } else {
                    const now = Date.now(), horizon = now + 32 * 86400000;
                    events.entries.push(...dashboardEntries(snapshot, player).filter(entry => entry.kind === 'events' &&
                        (eventBoundary(entry.endDate, true, entry.eventSchedule)?.getTime() ?? Infinity) > now - 2 * 86400000 &&
                        (eventBoundary(entry.startDate, false, entry.eventSchedule)?.getTime() ?? 0) < horizon));
                }
            } catch {summary.errors.push({ gameId: game.gameId, message: `Could not load ${game.name}. Retry this widget.` });}
        }));
    }
    summary.games.sort((a, b) => a.game.name.localeCompare(b.game.name));
    respond(response, 200, match[1] === 'summary' ? summary : events);
    return true;
}
