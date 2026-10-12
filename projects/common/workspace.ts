import { PatchOverview, validPatchOverview, validRowCompletion } from './story-template';
export type Kind =
    | 'inventory'
    | 'characters'
    | 'teams'
    | 'plans'
    | 'story'
    | 'events'
    | 'achievements'
    | 'achievement-category'
    | 'story-category';
export type Entry = {
    patchOverview?: PatchOverview;
    mainStory?: PatchOverview;
    sideStories?: PatchOverview;
    worldQuests?: PatchOverview;
    storyRowCompletion?: Record<string, boolean>;
    storySection?: string;
    icon?: string;
    wikiUrl?: string;
    reward?: string;
    rewardIcon?: string;
    description?: string;
    requirementText?: string;
    id: string;
    game: string;
    kind: Kind;
    name: string;
    notes: string;
    quantity: number;
    target: number;
    category: string;
    rarity: number;
    members: string[];
    requirements: { item: string; amount: number }[];
    completed: boolean;
    order: number;
    day: string;
};
/** Only player-owned state stays in the browser; these fields never enter the catalog. */
export type PlayerState = Pick<Entry, 'completed' | 'quantity' | 'target' | 'storyRowCompletion'>;
export type CatalogEntry = Omit<Entry, keyof PlayerState>;
export type GameSnapshot = { id: string; name: string; revision: number; entries: CatalogEntry[] };
export const CATALOG_FIELDS = {
    inventory: 'inventory',
    characters: 'characters',
    teams: 'teams',
    plans: 'plans',
    story: 'story',
    events: 'events',
    achievements: 'achievements',
    'achievement-category': 'achievementCategories',
    'story-category': 'storyCategories',
} as const;

export function fromCatalog(entry: CatalogEntry, player?: PlayerState): Entry {
    const template = entry.category === 'side-stories' ? entry.sideStories : entry.category === 'world-quests' ? entry.worldQuests : entry.category === 'main-story' ? entry.mainStory : entry.category === 'patch-overview' ? entry.patchOverview : undefined;
    const quests = template?.rows.filter((row) => !row.rowType || row.rowType === 'quest');
    return {
        ...entry,
        completed:
            entry.kind === 'story' && template
                ? quests!.length > 0 &&
                  quests!.every(
                      (row) => player?.storyRowCompletion?.[row.id] === true,
                  )
                : player?.completed ?? false,
        quantity: player?.quantity ?? 0,
        target: player?.target ?? 90,
        ...(player?.storyRowCompletion ? { storyRowCompletion: player.storyRowCompletion } : {}),
    };
}
/** Whitelist fields to keep browser-only state (and arbitrary imported properties) off the wire. */
export function toCatalog(entry: Entry): CatalogEntry {
    return {
        id: entry.id,
        game: entry.game,
        kind: entry.kind,
        name: entry.name,
        notes: entry.notes,
        category: entry.category,
        rarity: entry.rarity,
        members: entry.members,
        requirements: entry.requirements,
        order: entry.order,
        day: entry.day,
        ...(entry.worldQuests !== undefined ? { worldQuests: entry.worldQuests } : {}),
        ...(entry.sideStories !== undefined ? { sideStories: entry.sideStories } : {}),
        ...(entry.mainStory !== undefined ? { mainStory: entry.mainStory } : {}),
        ...(entry.patchOverview !== undefined ? { patchOverview: entry.patchOverview } : {}),
        ...(entry.storySection !== undefined ? { storySection: entry.storySection } : {}),
        ...(entry.icon !== undefined ? { icon: entry.icon } : {}),
        ...(entry.wikiUrl !== undefined ? { wikiUrl: entry.wikiUrl } : {}),
        ...(entry.reward !== undefined ? { reward: entry.reward } : {}),
        ...(entry.rewardIcon !== undefined ? { rewardIcon: entry.rewardIcon } : {}),
        ...(entry.description !== undefined ? { description: entry.description } : {}),
        ...(entry.requirementText !== undefined ? { requirementText: entry.requirementText } : {}),
    };
}
export function validCatalog(value: unknown, game: string): value is CatalogEntry[] {
    if (!Array.isArray(value)) {
        return false;
    }
    const allowed = new Set([
        'id',
        'game',
        'kind',
        'name',
        'notes',
        'category',
        'rarity',
        'members',
        'requirements',
        'order',
        'day',
        'icon',
        'wikiUrl',
        'reward',
        'rewardIcon',
        'description',
        'requirementText',
        'storySection',
        'patchOverview',
        'mainStory',
        'sideStories',
        'worldQuests',
    ]);
    if (
        !value.every(
            (entry: unknown) =>
                entry !== null &&
                typeof entry === 'object' &&
                Object.keys(entry).every((key) => allowed.has(key)),
        )
    ) {
        return false;
    }
    const entries = (value as CatalogEntry[]).map((e) => fromCatalog(e));
    if (entries.some((entry) => !Number.isSafeInteger(entry.order))) {
        return false;
    }
    if (!validEntries(entries) || entries.some((e) => e.game !== game || !e.id || !e.name.trim())) {
        return false;
    }
    const ids = new Map(entries.map((e) => [e.id, e]));
    return entries.every(
        (e) =>
            (e.kind !== 'achievements' || ids.get(e.category)?.kind === 'achievement-category') &&
            (e.kind !== 'story' ||
                e.storySection === undefined ||
                ids.get(e.storySection)?.kind === 'story-category') &&
            e.members.every((id) => ids.get(id)?.kind === 'characters') &&
            e.requirements.every((r) => ids.get(r.item)?.kind === 'inventory'),
    );
}
export const GAMES = [
    {
        id: 'genshin',
        name: 'Genshin Impact',
        short: 'GI',
        color: '#dcb975',
        subtitle: 'Teyvat awaits',
    },
    {
        id: 'hsr',
        name: 'Honkai: Star Rail',
        short: 'HSR',
        color: '#ae9bff',
        subtitle: 'Beyond the stars',
    },
    {
        id: 'wuwa',
        name: 'Wuthering Waves',
        short: 'WW',
        color: '#75cbbb',
        subtitle: 'Echoes of Solaris',
    },
    {
        id: 'zzz',
        name: 'Zenless Zone Zero',
        short: 'ZZZ',
        color: '#dfed70',
        subtitle: 'Welcome to New Eridu',
    },
    {
        id: 'endfield',
        name: 'Arknights: Endfield',
        short: 'AE',
        color: '#eea575',
        subtitle: 'A new frontier',
    },
];
export function validEntries(value: unknown): value is Entry[] {
    return (
        Array.isArray(value) &&
        value.length <= 20000 &&
        value.every(
            (e: Entry) =>
                e &&
                typeof e.id === 'string' &&
                GAMES.some((g) => g.id === e.game) &&
                [
                    'inventory',
                    'characters',
                    'teams',
                    'plans',
                    'story',
                    'events',
                    'achievements',
                    'achievement-category',
                    'story-category',
                ].includes(e.kind) &&
                typeof e.name === 'string' &&
                typeof e.notes === 'string' &&
                typeof e.category === 'string' &&
                typeof e.day === 'string' &&
                typeof e.completed === 'boolean' &&
                validPatchOverview(e.patchOverview) &&
                validPatchOverview(e.mainStory) &&
                validPatchOverview(e.sideStories) &&
                validPatchOverview(e.worldQuests) &&
                validRowCompletion(e.storyRowCompletion) &&
                [
                    e.icon,
                    e.wikiUrl,
                    e.reward,
                    e.requirementText,
                    e.rewardIcon,
                    e.description,
                    e.storySection,
                ].every((v) => typeof v === 'undefined' || typeof v === 'string') &&
                [e.quantity, e.target, e.rarity, e.order].every(
                    (n) => Number.isFinite(n) && n >= 0,
                ) &&
                Array.isArray(e.members) &&
                e.members.every((m) => typeof m === 'string') &&
                Array.isArray(e.requirements) &&
                e.requirements.every(
                    (r) =>
                        r &&
                        typeof r.item === 'string' &&
                        Number.isFinite(r.amount) &&
                        r.amount > 0,
                ),
        ) &&
        new Set(value.map((e: Entry) => e.id)).size === value.length
    );
}
/** Preserve earlier standalone achievements by placing them into categories. */
export function migrateAchievements(entries: Entry[]): Entry[] {
    const result = entries.map((e) => ({ ...e }));
    for (const achievement of result.filter((e) => e.kind === 'achievements')) {
        if (
            result.some(
                (e) =>
                    e.kind === 'achievement-category' &&
                    e.id === achievement.category &&
                    e.game === achievement.game,
            )
        ) {
            continue;
        }
        const title =
            achievement.category && achievement.category !== 'Materials'
                ? achievement.category
                : 'General';
        const id = `achievement-category:${achievement.game}:${encodeURIComponent(title)}`;
        if (!result.some((e) => e.id === id)) {
            result.push({
                ...achievement,
                id,
                kind: 'achievement-category',
                name: title,
                icon: '\u2606',
                wikiUrl: '',
                reward: '',
                notes: '',
                category: '',
                completed: false,
                members: [],
                requirements: [],
            });
        }
        achievement.category = id;
        achievement.requirementText ??= achievement.notes;
    }
    return result;
}
export function parseBackup(raw: string): Entry[] {
    const data: unknown = JSON.parse(raw);
    if (
        !data ||
        typeof data !== 'object' ||
        !('version' in data) ||
        data.version !== 1 ||
        !('entries' in data) ||
        !validEntries(data.entries)
    ) {
        throw new Error('Invalid workspace backup');
    }
    return migrateStory(migrateAchievements(data.entries));
}

/** Give legacy guide steps a stable parent without changing their player progress keys. */
export function migrateStory(entries: Entry[]): Entry[] {
    const result = entries.map((entry) => ({ ...entry }));
    for (const entry of result.filter(
        (value) => value.kind === 'story' && value.storySection === undefined,
    )) {
        const id = `story-category:${entry.game}:general`;
        if (!result.some((value) => value.id === id)) {
            result.push({
                id,
                game: entry.game,
                kind: 'story-category',
                name: 'General',
                icon: '',
                order: 0,
                notes: '',
                category: '',
                rarity: 1,
                members: [],
                requirements: [],
                day: '',
                completed: false,
                quantity: 0,
                target: 0,
            });
        }
        entry.storySection = id;
    }
    return result;
}
