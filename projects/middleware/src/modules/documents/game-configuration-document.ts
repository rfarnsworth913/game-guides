import type { Document } from 'mongodb';
import type { GameDocument, GameRegistration } from '@lib/types/games.type';
import { legacyGameRegistration, validGameOverview, validGameId } from '@common/workspace/game-overview';
import { GAMES } from '@lib/constants/workspace.constants';

export const GAME_CONTENT_FIELDS = ['achievements', 'characters', 'events', 'inventory', 'plans', 'story', 'teams'] as const;

/** Unidentified records cannot be migrated safely; retain them without assigning a guessed game. */
export function hasStoredGameIdentity(document: Document): boolean {
    const legacy = document['_gameOverview'] as Record<string, unknown> | undefined;
    return [document['gameId'], document['_gameId'], legacy?.['id'], legacy?.['gameId'], document['name']]
        .some(value => value !== null && value !== globalThis.undefined && value !== '');
}

export function storedGameId(document: Document): string {
    const name = String(document['name'] ?? '');
    const parserIds: Record<string, string> = { 'Fate Grand Order': 'fgo', 'Fate/Grand Order': 'fgo', 'Girls Frontline 2': 'gf2', "Girls' Frontline 2": 'gf2' };
    const legacy = document['_gameOverview'] as Record<string, unknown> | undefined;
    const legacyId: unknown = legacy?.['gameId'] ?? legacy?.['id'];
    const id: unknown = document['gameId'] ?? document['_gameId'] ?? legacyId ?? GAMES.find(game => game.name.replace(':', '') === name.replace(':', ''))?.id ?? parserIds[name] ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!validGameId(id)) {throw new Error('Game configuration migration requires a valid stable game ID.');}
    return id;
}

export function documentConfiguration(document: Document, id: string): GameRegistration {
    if (document['gameConfiguration']) {
        const { genre, searchAliases: _removedAliases, ...configuration } = document['gameConfiguration'] as Record<string, unknown>;
        if (genre !== globalThis.undefined && typeof genre !== 'string') {throw new Error(`Invalid legacy genre for ${id}.`);}
        const genres: unknown = configuration['genres'] === globalThis.undefined ? [] : configuration['genres'];
        const registration = { ...configuration, gameId: id, genres: Array.isArray(genres)
            ? [...new Set([...(genres as unknown[]), ...(typeof genre === 'string' && genre.trim() ? [genre.trim()] : [])])]
            : genres };
        if (!validGameOverview(registration)) {throw new Error(`Invalid game configuration for ${id}.`);}
        return registration;
    }
    return legacyGameRegistration(id, document['_gameOverview'] ?? { name: document['name'] as unknown ?? id });
}

export function configurationFields(document: Document, id: string): GameDocument {
    const { gameId: identity, ...gameConfiguration } = documentConfiguration(document, id);
    if (document['content'] !== globalThis.undefined && (!document['content'] || typeof document['content'] !== 'object' || Array.isArray(document['content']))) {throw new Error('Invalid nested game content; original document preserved.');}
    const content = { ...document['content'] as GameDocument['content'] | undefined };
    for (const key of GAME_CONTENT_FIELDS) {
        if (content[key] !== globalThis.undefined && !Array.isArray(content[key])) {throw new Error(`Invalid content.${key}; original document preserved.`);}
        if (content[key] === globalThis.undefined && Array.isArray(document[key])) {content[key] = document[key] as unknown[];}
    }
    return { gameId: identity, gameConfiguration, content,
        version: document['version'] as GameDocument['version'] ?? { title: '', url: '', releaseDate: null } };
}

/** Existing domain adapters keep their flat view until the domain-model refactor. */
export function flatGameDocument(document: Document): Document {
    return { ...document, ...document['content'] as Document | undefined };
}

export function gameContentPath(document: Document, field: string): string {
    return document['content'] ? `content.${field}` : field;
}
export function readGameContent(document: Document, field: string): unknown {
    return (document['content'] as Document | undefined)?.[field] ?? document[field];
}
