import type { CharacterAttributeDefinition, CharacterProgressionProfile, CharacterResource, CharacterAbility, ProgressionTrackDefinition, CharacterExtension } from '../../lib/types/character-extension.type';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const only = (value: Record<string, unknown>, fields: string[]) => Object.keys(value).every(key => fields.includes(key));
const text = (value: unknown, max = 5000): value is string => typeof value === 'string' && value.length <= max;
const label = (value: unknown): value is string => text(value, 160) && !!value.trim();
const key = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value);
const number = (value: unknown, min = 0): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= 1000000;
const quantity = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 100 && value.every(label) && new Set(value).size === value.length;
const optional = (value: unknown, valid: (value: unknown) => boolean) => value === globalThis.undefined || valid(value);
const url = (value: unknown) => {
    if (!text(value, 2000)) {return false;}
    try {const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;} catch {return false;}
};
const unique = <T extends { id: string }>(values: T[]) => new Set(values.map(value => value.id)).size === values.length;
export function characterHeadshotUrl(value: string): string | null {
    return url(value) || /^\/?(?:assets|icons|images)\/[\w/.,% -]+$/.test(value) || /^\/api\/games\/[a-z][a-z0-9-]*\/images\/[a-z0-9][a-z0-9-]*\.(?:png|jpg|webp|gif)$/.test(value) ? value : null;
}
export function validCharacterAttributes(value: unknown): value is CharacterAttributeDefinition[] {
    return Array.isArray(value) && value.length <= 100 && value.every(item => record(item) && only(item, ['id', 'label', 'type', 'options', 'displayOrder', 'filterable', 'visibleInHeader', 'searchable', 'visibleInDetails', 'required']) &&
        key(item['id']) && label(item['label']) && ['string', 'number', 'boolean', 'enum', 'multi-select'].includes(String(item['type'])) &&
        ['searchable', 'visibleInDetails', 'required'].every(field => optional(item[field], value => typeof value === 'boolean')) &&
        number(item['displayOrder']) && typeof item['filterable'] === 'boolean' && typeof item['visibleInHeader'] === 'boolean' &&
        optional(item['options'], strings) && (!['enum', 'multi-select'].includes(String(item['type'])) || (Array.isArray(item['options']) && item['options'].length > 0))) && unique(value as CharacterAttributeDefinition[]);
}
export function validCharacterResources(value: unknown): value is CharacterResource[] {
    return Array.isArray(value) && value.length <= 200 && value.every(item => record(item) && only(item, ['id', 'category', 'title', 'sourceType', 'url', 'contentId', 'description', 'creator', 'language', 'tags', 'isOfficial', 'sortOrder']) &&
        key(item['id']) && label(item['category']) && label(item['title']) &&
        (item['sourceType'] === 'external' ? url(item['url']) && item['contentId'] === globalThis.undefined : item['sourceType'] === 'internal' && key(item['contentId']) && item['url'] === globalThis.undefined) &&
        optional(item['description'], text) && optional(item['creator'], label) && optional(item['language'], label) && optional(item['tags'], strings) &&
        optional(item['isOfficial'], value => typeof value === 'boolean') && optional(item['sortOrder'], number)) && unique(value as CharacterResource[]);
}
export function validCharacterAbilities(value: unknown): value is CharacterAbility[] {
    return Array.isArray(value) && value.length <= 100 && value.every(item => record(item) && only(item, ['id', 'name', 'category', 'description', 'icon', 'sourceUrl', 'progressionTrackId', 'unlockRequirements']) &&
        key(item['id']) && label(item['name']) && label(item['category']) && optional(item['description'], text) && optional(item['sourceUrl'], url) &&
        optional(item['icon'], value => url(value) || (text(value, 2000) && /^\/?(?:assets|icons|images)\/[\w/.,% -]+$/.test(value))) && optional(item['progressionTrackId'], key) &&
        optional(item['unlockRequirements'], strings)) && unique(value as CharacterAbility[]);
}
export const trackMinimum = (track: ProgressionTrackDefinition) => track.type === 'unlock' ? 0 : track.minValue ?? track.levels?.[0] ?? 0;
export const trackMaximum = (track: ProgressionTrackDefinition) => track.type === 'unlock' ? 1 : track.maxValue ?? track.levels?.at(-1) ?? 0;
export const trackAllows = (track: ProgressionTrackDefinition, value: number) => value >= trackMinimum(track) && value <= trackMaximum(track) && (!track.levels || track.levels.includes(value));
export function validProgressionTracks(value: unknown): value is ProgressionTrackDefinition[] {
    if (!Array.isArray(value) || value.length > 200 || !value.every(item => record(item) && only(item, ['id', 'label', 'type', 'minValue', 'maxValue', 'levels', 'displayOrder', 'abilityId', 'dependencies', 'upgradeCosts', 'storage']) &&
        key(item['id']) && label(item['label']) && ['level', 'ascension', 'skill', 'unlock', 'enhancement', 'equipment', 'custom'].includes(String(item['type'])) && number(item['displayOrder']) &&
        optional(item['minValue'], number) && optional(item['maxValue'], number) && optional(item['abilityId'], key) &&
        optional(item['storage'], storage => record(storage) && only(storage, ['field', 'key']) && item['type'] !== 'unlock' &&
            (storage['field'] === 'level' || storage['field'] === 'ascensionRank' ? storage['key'] === globalThis.undefined : ['skillLevels', 'progression'].includes(String(storage['field'])) && key(storage['key']))) &&
        optional(item['levels'], values => Array.isArray(values) && values.length > 0 && values.length <= 1000 && values.every((value, index) => number(value) && (!index || value > values[index - 1]))) &&
        optional(item['dependencies'], values => Array.isArray(values) && values.length <= 200 && values.every(dependency => record(dependency) && only(dependency, ['trackId', 'requiredValue']) && key(dependency['trackId']) && number(dependency['requiredValue']))) &&
        optional(item['upgradeCosts'], values => Array.isArray(values) && values.length <= 1000 && values.every(cost => record(cost) && only(cost, ['fromValue', 'toValue', 'materials']) && number(cost['fromValue']) && number(cost['toValue']) && cost['toValue'] > cost['fromValue'] &&
            Array.isArray(cost['materials']) && cost['materials'].length > 0 && cost['materials'].length <= 100 && cost['materials'].every(material => record(material) && only(material, ['itemId', 'quantity']) && key(material['itemId']) && quantity(material['quantity'])) && new Set(cost['materials'].map(material => (material as Record<string, unknown>)['itemId'])).size === cost['materials'].length)))) {return false;}
    const tracks = value as ProgressionTrackDefinition[];
    if (!unique(tracks)) {return false;}
    return tracks.every(track => (track.type === 'unlock' ? track.minValue === globalThis.undefined && track.maxValue === globalThis.undefined && track.levels === globalThis.undefined : (track.maxValue !== globalThis.undefined || !!track.levels) && trackMaximum(track) >= trackMinimum(track)) &&
        (!track.levels || track.levels.every(value => value >= trackMinimum(track) && value <= trackMaximum(track))) &&
        new Set(track.dependencies?.map(dependency => dependency.trackId)).size === (track.dependencies?.length ?? 0) &&
        new Set(track.upgradeCosts?.map(cost => `${cost.fromValue}/${cost.toValue}`)).size === (track.upgradeCosts?.length ?? 0) &&
        (track.upgradeCosts ?? []).every(cost => trackAllows(track, cost.fromValue) && trackAllows(track, cost.toValue)));
}
/** Dependencies must refer to achievable values, and the directed graph must be acyclic. */
export function validProgressionGraph(tracks: ProgressionTrackDefinition[]): boolean {
    const byId = new Map(tracks.map(track => [track.id, track]));
    const visited = new Set<string>(), active = new Set<string>();
    const visit = (track: ProgressionTrackDefinition): boolean => {
        if (active.has(track.id)) {return false;} if (visited.has(track.id)) {return true;}
        active.add(track.id);
        for (const dependency of track.dependencies ?? []) {
            const parent = byId.get(dependency.trackId);
            if (!parent || !trackAllows(parent, dependency.requiredValue) || !visit(parent)) {return false;}
        }
        active.delete(track.id); visited.add(track.id); return true;
    };
    return tracks.every(visit);
}
export function validProgressionProfiles(value: unknown): value is CharacterProgressionProfile[] {
    return Array.isArray(value) && value.length <= 50 && value.every(profile => record(profile) && only(profile, ['id', 'gameId', 'tracks']) && key(profile['id']) &&
        typeof profile['gameId'] === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(profile['gameId']) && validProgressionTracks(profile['tracks']) && validProgressionGraph(profile['tracks'])) && unique(value as CharacterProgressionProfile[]);
}
export function validCharacterExtension(value: Record<string, unknown>): value is Record<string, unknown> & CharacterExtension {
    return optional(value['headshot'], value => text(value, 2000) && !!characterHeadshotUrl(value)) &&
        optional(value['banner'], value => text(value, 2000) && !!characterHeadshotUrl(value)) && optional(value['alternateNames'], strings) &&
        optional(value['schemaVersion'], value => value === 2) && optional(value['progressionProfileId'], key) &&
        optional(value['attributes'], value => record(value) && Object.keys(value).length <= 100 && Object.entries(value).every(([id, value]) => key(id) && (typeof value === 'boolean' || text(value, 160) || number(value) || strings(value)))) &&
        optional(value['resources'], validCharacterResources) && optional(value['abilities'], validCharacterAbilities) && optional(value['progressionOverrides'], validProgressionTracks);
}
