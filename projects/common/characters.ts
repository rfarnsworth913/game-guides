/** Shared game rules and definitions contain no account state. */
export type CharacterSkill = { name: string; description: string };
export type CharacterGuide = { title: string; url: string };
export type CharacterDefinition = {
    weaponType: string;
    damageType: string;
    roles: string[];
    skills: CharacterSkill[];
    passiveSkills: CharacterSkill[];
    guides: CharacterGuide[];
};
export type CharacterRules = {
    levelCap: number;
    rarities: number[];
    weaponTypes: string[];
    damageTypes: string[];
    roles: string[];
    equipmentSlots: { id: string; label: string; limit: number }[];
    progressionTracks: { id: string; label: string; max: number }[];
};
export type CharacterCollection = {
    owned: boolean;
    level: number;
    gear: Record<string, string[]>;
    progression: Record<string, number>;
};
const record = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
const only = (value: Record<string, unknown>, keys: string[]) =>
    Object.keys(value).every((key) => keys.includes(key));
const text = (value: unknown): value is string =>
    typeof value === 'string' && value.length <= 5000;
const label = (value: unknown): value is string =>
    text(value) && !!value.trim() && value.length <= 160;
const integer = (value: unknown, min: number, max: number): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const labels = (value: unknown): value is string[] =>
    Array.isArray(value) &&
    value.length <= 50 &&
    value.every(label) &&
    new Set(value).size === value.length;
export const characterKey = (value: string) =>
    /^[a-zA-Z0-9_-]{1,100}$/.test(value) &&
    !['__proto__', 'constructor', 'prototype'].includes(value);
export function guideUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return (
            ['https:', 'http:'].includes(url.protocol) &&
            !url.username &&
            !url.password &&
            value.length <= 2000
        );
    } catch {
        return false;
    }
}
export function validCharacterDefinition(value: unknown): value is CharacterDefinition {
    if (
        !record(value) ||
        !only(value, ['weaponType', 'damageType', 'roles', 'skills', 'passiveSkills', 'guides'])
    )
        return false;
    const skills = (items: unknown) =>
        Array.isArray(items) &&
        items.length <= 50 &&
        items.every(
            (item) =>
                record(item) &&
                only(item, ['name', 'description']) &&
                label(item['name']) &&
                text(item['description']),
        );
    return (
        text(value['weaponType']) &&
        text(value['damageType']) &&
        labels(value['roles']) &&
        skills(value['skills']) &&
        skills(value['passiveSkills']) &&
        Array.isArray(value['guides']) &&
        value['guides'].length <= 30 &&
        value['guides'].every(
            (item) =>
                record(item) &&
                only(item, ['title', 'url']) &&
                label(item['title']) &&
                typeof item['url'] === 'string' &&
                guideUrl(item['url']),
        )
    );
}
export function validCharacterRules(value: unknown): value is CharacterRules {
    if (
        !record(value) ||
        !only(value, [
            'levelCap',
            'rarities',
            'weaponTypes',
            'damageTypes',
            'roles',
            'equipmentSlots',
            'progressionTracks',
        ])
    )
        return false;
    const tracks = (items: unknown, field: string, max: number) =>
        Array.isArray(items) &&
        items.length <= 30 &&
        items.every(
            (item) =>
                record(item) &&
                only(item, ['id', 'label', field]) &&
                typeof item['id'] === 'string' &&
                characterKey(item['id']) &&
                label(item['label']) &&
                integer(item[field], field === 'limit' ? 1 : 0, max),
        ) &&
        new Set(items.map((item) => item['id'])).size === items.length;
    return (
        integer(value['levelCap'], 1, 1000) &&
        Array.isArray(value['rarities']) &&
        value['rarities'].length > 0 &&
        value['rarities'].length <= 20 &&
        value['rarities'].every((n) => integer(n, 1, 20)) &&
        new Set(value['rarities']).size === value['rarities'].length &&
        labels(value['weaponTypes']) &&
        labels(value['damageTypes']) &&
        labels(value['roles']) &&
        tracks(value['equipmentSlots'], 'limit', 20) &&
        tracks(value['progressionTracks'], 'max', 1000)
    );
}
export function validCharacterCollection(value: unknown): value is CharacterCollection {
    return (
        record(value) &&
        only(value, ['owned', 'level', 'gear', 'progression']) &&
        typeof value['owned'] === 'boolean' &&
        integer(value['level'], 1, 1000) &&
        record(value['gear']) &&
        Object.keys(value['gear']).length <= 30 &&
        Object.entries(value['gear']).every(
            ([key, items]) =>
                characterKey(key) &&
                Array.isArray(items) &&
                items.length <= 20 &&
                items.every((item) => label(item)),
        ) &&
        record(value['progression']) &&
        Object.keys(value['progression']).length <= 30 &&
        Object.entries(value['progression']).every(
            ([key, n]) => characterKey(key) && integer(n, 0, 1000),
        )
    );
}
export function characterCollectionFits(
    value: CharacterCollection,
    rules: CharacterRules,
): boolean {
    return (
        value['level'] <= rules.levelCap &&
        Object.entries(value['gear']).every(([key, items]) => {
            const slot = rules.equipmentSlots.find((slot) => slot.id === key);
            return !!slot && items.length <= slot.limit;
        }) &&
        Object.entries(value['progression']).every(([key, n]) => {
            const track = rules.progressionTracks.find((track) => track.id === key);
            return !!track && n <= track.max;
        })
    );
}
export function characterDefinitionFits(
    value: CharacterDefinition,
    rarity: number,
    rules: CharacterRules,
): boolean {
    return (
        rules.rarities.includes(rarity) &&
        (!rules.weaponTypes.length || rules.weaponTypes.includes(value.weaponType)) &&
        (!rules.damageTypes.length || rules.damageTypes.includes(value.damageType)) &&
        (!rules.roles.length || value.roles.every((role) => rules.roles.includes(role)))
    );
}
export const emptyCharacterDefinition = (): CharacterDefinition => ({
    weaponType: '',
    damageType: '',
    roles: [],
    skills: [],
    passiveSkills: [],
    guides: [],
});
export const emptyCharacterCollection = (): CharacterCollection => ({
    owned: true,
    level: 1,
    gear: {},
    progression: {},
});
