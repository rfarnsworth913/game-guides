import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiDependencies } from '../../app/app.types';
import { ApiError } from '../../core/errors/app-error';
import { respond } from '../../core/http/response';
import { characterCatalogRecord } from '../../../../common/characters/character-catalog';
import { gameSupports, validGameId } from '../../../../common/workspace/game-overview';

export async function characterRoutes(request: IncomingMessage, response: ServerResponse, url: URL, dependencies: ApiDependencies): Promise<boolean> {
    const match = /^\/api\/games\/([a-z][a-z0-9-]*)\/(characters|character-progression)(?:\/([a-zA-Z0-9_-]{1,100}))?$/.exec(url.pathname);
    if (!match) {return false;}
    if (request.method !== 'GET') {throw new ApiError(405, 'Use the editor-authorized catalog API or account progress API to make changes.');}
    const [, game, kind, id] = match;
    if (!validGameId(game)) {throw new ApiError(404, 'Unknown game.');}
    const snapshot = await dependencies.repository.read(game);
    if (snapshot.id !== game || (snapshot.overview && (!gameSupports(snapshot.overview, 'characters') || snapshot.overview.archived))) {throw new ApiError(404, 'Character management is unavailable for this game.');}
    if (kind === 'character-progression') {
        const profiles = snapshot.characterRules?.progressionProfiles ?? [];
        if (id) {
            const profile = profiles.find(profile => profile.id === id);
            if (!profile) {throw new ApiError(404, 'Unknown progression profile.');}
            respond(response, 200, { revision: snapshot.revision, profile });
        } else {respond(response, 200, { revision: snapshot.revision, gameId: game, profiles, attributes: snapshot.characterRules?.attributes ?? [], resourceCategories: snapshot.characterRules?.resourceCategories ?? [], legacyRules: snapshot.characterRules ?? null });}
        return true;
    }
    if (id) {
        const character = snapshot.entries.find(entry => entry.kind === 'characters' && entry.id === id);
        if (!character) {throw new ApiError(404, 'Unknown character.');}
        respond(response, 200, { revision: snapshot.revision, character: characterCatalogRecord(character, snapshot.entries, snapshot.characterRules) });
        return true;
    }
    if ([...url.searchParams.keys()].some(key => !['offset', 'limit', 'search', 'rarity'].includes(key))) {throw new ApiError(400, 'Unknown character filter.');}
    const offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? 50), search = url.searchParams.get('search') ?? '', rarity = url.searchParams.get('rarity');
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200 || search.length > 500 || (rarity !== null && (!/^\d+$/.test(rarity) || Number(rarity) > 20))) {throw new ApiError(400, 'Invalid character filters or pagination.');}
    const characters = snapshot.entries.filter(entry => entry.kind === 'characters' && entry.name.toLowerCase().includes(search.trim().toLowerCase()) && (rarity === null || entry.rarity === Number(rarity))).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    respond(response, 200, { revision: snapshot.revision, total: characters.length, offset, limit, characters: characters.slice(offset, offset + limit).map(entry => characterCatalogRecord(entry, snapshot.entries, snapshot.characterRules)) });
    return true;
}
