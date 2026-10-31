export type FarmingPreferences = {
    selected: string[] | null;
    includeOther: boolean;
    includeUnassigned: boolean;
    mode: 'characters' | 'plans';
    category: string;
    region: string;
    rarity: string;
    missingOnly: boolean;
    ownedOnly: boolean;
    availableOnly: boolean;
    view: 'groups' | 'list' | 'schedule';
    sort: string;
    server: string;
};
export const defaultFarmingPreferences = (): FarmingPreferences => ({
    selected: null,
    includeOther: false,
    includeUnassigned: false,
    mode: 'characters',
    category: '',
    region: '',
    rarity: '',
    missingOnly: true,
    ownedOnly: false,
    availableOnly: false,
    view: 'groups',
    sort: 'source',
    server: '',
});
export function validFarmingPreferences(value: unknown): value is FarmingPreferences {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {return false;}
    const prefs = value as FarmingPreferences;
    return (
        (prefs.selected === null ||
            (Array.isArray(prefs.selected) &&
                prefs.selected.length <= 1000 &&
                prefs.selected.every((id) => typeof id === 'string'))) &&
        ['includeOther', 'includeUnassigned', 'missingOnly', 'ownedOnly', 'availableOnly'].every(
            (key) => typeof (value as Record<string, unknown>)[key] === 'boolean',
        ) &&
        ['category', 'region', 'rarity', 'sort', 'server'].every(
            (key) => typeof (value as Record<string, unknown>)[key] === 'string',
        ) &&
        ['characters', 'plans'].includes(prefs.mode) &&
        ['groups', 'list', 'schedule'].includes(prefs.view)
    );
}
