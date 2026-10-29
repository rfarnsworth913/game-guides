/** Shared game rules and definitions contain no account state. */
export type CharacterSkill = { id?: string; name: string; description: string; maxLevel?: number };
export type AscensionRank = { levelCap: number; skillLevelCap: number };
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
    ascensionRanks?: AscensionRank[];
    rarities: number[];
    weaponTypes: string[];
    damageTypes: string[];
    roles: string[];
    enhancementCategories?: string[];
    equipmentSlots: { id: string; label: string; limit: number; category?: string }[];
    progressionTracks: { id: string; label: string; max: number }[];
};
export type CharacterProgression = {
    level: number;
    ascensionRank?: number;
    skillLevels?: Record<string, number>;
    gear: Record<string, string[]>;
    progression: Record<string, number>;
};
export type CharacterCollection = CharacterProgression & {
    owned: boolean;
    target?: CharacterProgression;
    notes?: string;
    personalGuides?: CharacterGuide[];
};
const record = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
const only = (value: Record<string, unknown>, keys: string[]) =>
    Object.keys(value).every((key) => keys.includes(key));
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 5000;
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
                only(item, ['id', 'name', 'description', 'maxLevel']) &&
                (typeof item['id'] === 'undefined' ||
                    (typeof item['id'] === 'string' && characterKey(item['id']))) &&
                (typeof item['maxLevel'] === 'undefined' || integer(item['maxLevel'], 1, 1000)) &&
                label(item['name']) &&
                text(item['description']),
        ) &&
        new Set(items.map((item, index) => item.id ?? `legacy-${index}`)).size === items.length;
    return (
        text(value['weaponType']) &&
        text(value['damageType']) &&
        labels(value['roles']) &&
        skills(value['skills']) &&
        skills(value['passiveSkills']) &&
        new Set([
            ...(value['skills'] as CharacterSkill[]).map(
                (skill, index) => skill.id ?? `skill-${index}`,
            ),
            ...(value['passiveSkills'] as CharacterSkill[]).map(
                (skill, index) => skill.id ?? `passive-${index}`,
            ),
        ]).size ===
            (value['skills'] as CharacterSkill[]).length +
                (value['passiveSkills'] as CharacterSkill[]).length &&
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
            'ascensionRanks',
            'rarities',
            'weaponTypes',
            'damageTypes',
            'roles',
            'equipmentSlots',
            'enhancementCategories',
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
                only(
                    item,
                    field === 'limit' ? ['id', 'label', field, 'category'] : ['id', 'label', field],
                ) &&
                (field !== 'limit' ||
                    typeof item['category'] === 'undefined' ||
                    item['category'] === '' ||
                    (label(item['category']) &&
                        Array.isArray(value['enhancementCategories']) &&
                        value['enhancementCategories'].includes(item['category']))) &&
                typeof item['id'] === 'string' &&
                characterKey(item['id']) &&
                label(item['label']) &&
                integer(item[field], field === 'limit' ? 1 : 0, max),
        ) &&
        new Set(items.map((item) => item['id'])).size === items.length;
    return (
        integer(value['levelCap'], 1, 1000) &&
        (typeof value['ascensionRanks'] === 'undefined' ||
            (Array.isArray(value['ascensionRanks']) &&
                value['ascensionRanks'].length <= 30 &&
                value['ascensionRanks'].every(
                    (rank, index, ranks) =>
                        record(rank) &&
                        only(rank, ['levelCap', 'skillLevelCap']) &&
                        integer(rank['levelCap'], 1, value['levelCap'] as number) &&
                        integer(rank['skillLevelCap'], 1, 1000) &&
                        (index === 0 ||
                            (rank['levelCap'] > ranks[index - 1].levelCap &&
                                rank['skillLevelCap'] >= ranks[index - 1].skillLevelCap)),
                ) &&
                (!value['ascensionRanks'].length ||
                    value['ascensionRanks'].at(-1).levelCap === value['levelCap']))) &&
        Array.isArray(value['rarities']) &&
        value['rarities'].length > 0 &&
        value['rarities'].length <= 20 &&
        value['rarities'].every((n) => integer(n, 1, 20)) &&
        new Set(value['rarities']).size === value['rarities'].length &&
        labels(value['weaponTypes']) &&
        labels(value['damageTypes']) &&
        labels(value['roles']) &&
        (typeof value['enhancementCategories'] === 'undefined' ||
            labels(value['enhancementCategories'])) &&
        tracks(value['equipmentSlots'], 'limit', 20) &&
        tracks(value['progressionTracks'], 'max', 1000)
    );
}
export function validCharacterCollection(value: unknown): value is CharacterCollection {
    return (
        record(value) &&
        only(value, [
            'owned',
            'level',
            'gear',
            'progression',
            'ascensionRank',
            'skillLevels',
            'target',
            'notes',
            'personalGuides',
        ]) &&
        (typeof value['notes'] === 'undefined' || text(value['notes'])) &&
        (typeof value['personalGuides'] === 'undefined' ||
            (Array.isArray(value['personalGuides']) &&
                value['personalGuides'].length <= 30 &&
                value['personalGuides'].every(
                    (guide) =>
                        record(guide) &&
                        only(guide, ['title', 'url']) &&
                        label(guide['title']) &&
                        typeof guide['url'] === 'string' &&
                        guideUrl(guide['url']),
                ))) &&
        (typeof value['target'] === 'undefined' ||
            (record(value['target']) &&
                only(value['target'], [
                    'level',
                    'gear',
                    'progression',
                    'ascensionRank',
                    'skillLevels',
                ]) &&
                validCharacterCollection({ ...value['target'], owned: true }))) &&
        (typeof value['ascensionRank'] === 'undefined' || integer(value['ascensionRank'], 0, 29)) &&
        (typeof value['skillLevels'] === 'undefined' ||
            (record(value['skillLevels']) &&
                Object.keys(value['skillLevels']).length <= 100 &&
                Object.entries(value['skillLevels']).every(
                    ([key, level]) => characterKey(key) && integer(level, 1, 1000),
                ))) &&
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
    definition?: CharacterDefinition,
): boolean {
    const ranks = rules.ascensionRanks ?? [];
    const rank = ranks[value.ascensionRank ?? 0];
    const skills = definition
        ? [
              ...definition.skills.map((skill, index) => ({
                  ...skill,
                  key: skill.id ?? `skill-${index}`,
              })),
              ...definition.passiveSkills.map((skill, index) => ({
                  ...skill,
                  key: skill.id ?? `passive-${index}`,
              })),
          ]
        : [];
    return (
        (!value.target ||
            (characterCollectionFits({ ...value.target, owned: true }, rules, definition) &&
                value.target.level >= value.level &&
                (value.target.ascensionRank ?? 0) >= (value.ascensionRank ?? 0) &&
                skills.every(
                    (skill) =>
                        (value.target!.skillLevels?.[skill.key] ?? 1) >=
                        (value.skillLevels?.[skill.key] ?? 1),
                ) &&
                rules.progressionTracks.every(
                    (track) =>
                        (value.target!.progression[track.id] ?? 0) >=
                        (value.progression[track.id] ?? 0),
                ))) &&
        (!ranks.length ? (value.ascensionRank ?? 0) === 0 : !!rank) &&
        value.level >= (ranks[(value.ascensionRank ?? 0) - 1]?.levelCap ?? 1) &&
        value.level <= (rank?.levelCap ?? rules.levelCap) &&
        Object.entries(value.skillLevels ?? {}).every(([key, level]) => {
            const skill = skills.find((skill) => skill.key === key);
            return (
                !!skill && level <= (skill.maxLevel ?? 1) && level <= (rank?.skillLevelCap ?? 1000)
            );
        }) &&
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
