import { GAMES } from '@lib/constants/workspace.constants';
import type { GameFeature, GameRegistration } from '@lib/types/games.type';
import { storyImageUrl } from '@common/quests/story-template';

export const GAME_FEATURES: { id: GameFeature; title: string; description: string; icon: string }[] = [
    { id: 'story', title: 'Story Guide', description: 'Story quests, world quests, lore and related media.', icon: 'M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1Zm0 0v16' },
    { id: 'characters', title: 'Character Management', description: 'Shared character definitions and personal collections.', icon: 'M20 21v-2a7 7 0 0 0-14 0v2M9 4a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z' },
    { id: 'teams', title: 'Teams', description: 'Personal team compositions.', icon: 'M2 21v-2a5 5 0 0 1 10 0v2m2-6a5 5 0 0 1 8 4v2M4 6a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm11 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z' },
    { id: 'inventory', title: 'Inventory', description: 'Materials, items and owned quantities.', icon: 'M3 7h18v14H3ZM2 3h20v4H2Zm7 8h6' },
    { id: 'plans', title: 'Planner', description: 'Goals and progress tracking.', icon: 'M8 4H4v18h16V4h-4M8 2h8v4H8Zm0 11 3 3 5-6' },
    { id: 'events', title: 'Events', description: 'Event schedules and personal completion.', icon: 'M3 5h18v16H3Zm4-3v6m10-6v6M3 11h18m-13 4h2m4 0h2' },
    { id: 'farming', title: 'Farming', description: 'Material sources and farming plans.', icon: 'M12 22V12M12 16C3 16 3 7 3 7c9 0 9 9 9 9Zm0-4C12 3 21 3 21 3s0 9-9 9Z' },
    { id: 'achievements', title: 'Achievements', description: 'Achievement categories and completion.', icon: 'M8 3h8v8a4 4 0 0 1-8 0Zm0 2H3v3a5 5 0 0 0 5 5m8-8h5v3a5 5 0 0 1-5 5m-4 2v6m-5 0h10' },
];
export type GameOverviewField = 'id' | 'name' | 'short' | 'description' | 'genres' | 'icon' | 'banner' | 'features' | 'color' | 'form';

/** Only opaque RGB colors are accepted; arbitrary CSS expressions are not game settings. */
export function gameColorChannels(value: string): [number, number, number] | null {
    if (/^#[a-f0-9]{6}$/i.test(value.trim())) {
        const hex = value.trim().slice(1);
        return [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
    }
    const match = /^(rgb|rgba)\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(1(?:\.0+)?)\s*)?\)$/.exec(value.trim());
    if (!match || (match[1] === 'rgba') !== !!match[5]) {return null;}
    const channels = match.slice(2, 5).map(Number);
    return channels.every(channel => channel <= 255) ? channels as [number, number, number] : null;
}
export function normalizeGameColor(value: string): string | null {
    const channels = gameColorChannels(value);
    return channels ? `rgba(${channels.join(', ')}, 1)` : null;
}
export function gameColorHex(value: string): string | null {
    const channels = gameColorChannels(value);
    return channels ? '#' + channels.map(channel => channel.toString(16).padStart(2, '0')).join('') : null;
}
export function validGameId(value: unknown): value is string {
    return typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64 &&
        !['constructor', 'prototype', 'registry', 'catalog', 'parsed', 'overview', 'images'].includes(value);
}
export function defaultGameOverview(id: string): GameRegistration {
    const game = GAMES.find(item => item.id === id);
    return { gameId: id, name: game?.name ?? id, short: game?.short ?? id.slice(0, 4).toUpperCase(), subtitle: game?.subtitle ?? '',
        color: game?.color ?? 'var(--color-primary)', description: '', genres: [], icon: '', banner: '',
        features: Object.fromEntries(GAME_FEATURES.map(item => [item.id, { feature: item.id, visibility: 'public' as const }])), visibility: 'public', revision: 0 };
}
export function gameOverviewErrors(value: unknown): Partial<Record<GameOverviewField, string>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {return { form: 'Invalid game overview.' };}
    const game = value as GameRegistration;
    const errors: Partial<Record<GameOverviewField, string>> = {};
    if (!validGameId(game.gameId)) {errors.id = 'Use a game ID starting with a lowercase letter, followed by lowercase letters, numbers or single hyphens (up to 64 characters). Reserved IDs are unavailable.';}
    if (typeof game.name !== 'string' || !game.name.trim() || game.name.length > 120) {errors.name = 'Enter a name of 1–120 characters.';}
    if (typeof game.short !== 'string' || !game.short.trim() || game.short.length > 8) {errors.short = 'Enter a short name of 1–8 characters.';}
    if (typeof game.description !== 'string' || game.description.length > 500) {errors.description = 'Description must be 500 characters or fewer.';}
    if (!Array.isArray(game.genres) || game.genres.length > 30 || !game.genres.every((genre:unknown) => typeof genre === 'string' && !!genre.trim() && genre.length <= 80) || new Set(game.genres).size !== game.genres.length) {errors.genres = 'Enter up to 30 unique genres, each 1–80 characters.';}
    for (const field of ['icon', 'banner'] as const) {
        const url = game[field];
        if (typeof url !== 'string' || url.length > 2048 || (!!url && storyImageUrl(url) === null)) {errors[field] = 'Choose an image from the picker or enter a valid HTTP(S) image URL.';}
    }
    if (!game.features || typeof game.features !== 'object' || Array.isArray(game.features) ||
        !Object.entries(game.features).every(([key, value]) => GAME_FEATURES.some(feature => feature.id === key) &&
            value && typeof value === 'object' && value.feature === key && ['public', 'editors'].includes(value.visibility) &&
            Object.keys(value).every(field => ['feature', 'visibility'].includes(field)))) {errors.features = 'Choose supported features with matching IDs and public or editor visibility.';}
    if (typeof game.color !== 'string' || (!normalizeGameColor(game.color) && game.color !== defaultGameOverview(typeof game.gameId === 'string' ? game.gameId : '').color)) {errors.color = 'Choose an opaque highlight color or enter #RRGGBB, rgb(r, g, b) or rgba(r, g, b, 1).';}
    for(const field of ['createdAt','updatedAt'] as const) {
        if(game[field]!==globalThis.undefined && (typeof game[field]!=='string' || !Number.isFinite(Date.parse(game[field]!)))) {errors.form='Invalid game timestamps.';}
    }
    if (!Object.keys(value).every(key => ['gameId', 'name', 'short', 'subtitle', 'description', 'genres', 'icon', 'banner', 'features', 'visibility', 'revision', 'color','createdAt','updatedAt'].includes(key)) ||
        typeof game.subtitle !== 'string' || game.subtitle.length > 160 || !['public', 'editors'].includes(game.visibility) || !Number.isSafeInteger(game.revision) || game.revision < 0 || game.revision >= Number.MAX_SAFE_INTEGER) {errors.form = 'Invalid game metadata. Reload the game list and try again.';}
    return errors;
}
export function validGameOverview(value: unknown): value is GameRegistration {
    return Object.keys(gameOverviewErrors(value)).length === 0;
}
export function gameSupports(game: Pick<GameRegistration, 'features'> | undefined, feature: string): boolean {
    return !!game && (feature === 'dashboard' || Object.hasOwn(game.features, feature));
}

/** Workspace visibility only; global shared catalog data remains public. */
export function canAccessGame(game: Pick<GameRegistration, 'visibility'>, editor = false): boolean {
    return game.visibility === 'public' || editor;
}
export function canAccessFeature(game: GameRegistration | undefined, feature: string, editor = false): boolean {
    return !!game && canAccessGame(game, editor) && gameSupports(game, feature) &&
        (feature === 'dashboard' || game.features[feature as GameFeature]?.visibility === 'public' || editor);
}

/** Explicit adapter for pre-configuration documents; never used to validate new requests. */
export function legacyGameRegistration(id: string, value: unknown): GameRegistration {
    const defaults = defaultGameOverview(id);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {return defaults;}
    const old = value as Record<string, unknown>;
    if (old['genres'] !== globalThis.undefined && !Array.isArray(old['genres'])) {throw new Error(`Invalid legacy genres for ${id}; original data must be preserved.`);}
    const features = Array.isArray(old['features']) ? Object.fromEntries(old['features']
        .filter((key): key is GameFeature => typeof key === 'string' && GAME_FEATURES.some(feature => feature.id === key))
        .map(feature => [feature, { feature, visibility: 'public' as const }])) : old['features'] === globalThis.undefined ? defaults.features : old['features'] as GameRegistration['features'];
    const result = { ...defaults, ...Object.fromEntries(['name', 'short', 'subtitle', 'description', 'icon', 'banner', 'color', 'revision'].filter(key => old[key] !== globalThis.undefined).map(key => [key, old[key]])),
        genres: [...new Set([...(Array.isArray(old['genres']) ? old['genres'] as unknown[] : []), ...[old['gameType'],old['genre']].filter((genre):genre is string=>typeof genre==='string' && !!genre.trim()).map(genre=>genre.trim())])],
        features, visibility: old['archived'] === true || old['visibility'] === 'editors' ? 'editors' as const : 'public' as const };
    if (!validGameOverview(result)) {throw new Error(`Invalid legacy configuration for ${id}; original data must be preserved.`);}
    return result;
}
