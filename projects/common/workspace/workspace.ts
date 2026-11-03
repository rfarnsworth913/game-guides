import { validPatchOverview, validRowCompletion } from '../quests/story-template';
import { storyRowDone, storyTemplateFor } from '../quests/story-guide';
import { validCharacterCollection, validCharacterDefinition, validCharacterRules } from '../characters/characters';
import type { Entry, PlayerState, CatalogEntry } from '../../lib/types/workspace.type';
import { GAMES } from '../../lib/constants/workspace.constants';

/** Give legacy guide steps a stable parent without changing their player progress keys. */
export function migrateStory(entries: Entry[]): Entry[] {
    const result = entries.map((entry) => ({ ...entry }));
    for (const entry of result.filter(
        (value) => value.kind === 'story' && value.storySection === globalThis.undefined,
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
                (e.region === globalThis.undefined || (e.kind === 'inventory' && typeof e.region === 'string' && e.region.length <= 160)) &&
                (e.maxStack === globalThis.undefined || (e.kind === 'inventory' && Number.isSafeInteger(e.maxStack) && e.maxStack >= 1 && e.maxStack <= 1e9)) &&
                (e.kind !== 'inventory' || (Number.isSafeInteger(e.quantity) && e.quantity <= (e.maxStack ?? 1e9))) &&
                [e.startDate, e.endDate, e.eventType].every((field) => typeof field === 'undefined' || (typeof field === 'string' && field.length <= 160)) &&
                validPatchOverview(e.patchOverview) &&
                validPatchOverview(e.mainStory) &&
                validPatchOverview(e.sideStories) &&
                validPatchOverview(e.eventStory) &&
                validPatchOverview(e.worldQuests) &&
                validPatchOverview(e.lore) &&
                validPatchOverview(e.characterInformation) &&
                validRowCompletion(e.storyRowCompletion) &&
                (e.characterDefinition === globalThis.undefined || (e.kind === 'characters' && Number.isSafeInteger(e.rarity) && e.rarity >= 1 && e.rarity <= 20 && validCharacterDefinition(e.characterDefinition))) &&
                (e.characterCollection === globalThis.undefined || (e.kind === 'characters' && validCharacterCollection(e.characterCollection))) &&
                [
                    e.icon,
                    e.sectionImageUrl,
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


export function fromCatalog(entry: CatalogEntry, player?: PlayerState): Entry {
    const template = storyTemplateFor(entry);
    const quests = template?.rows.filter((row) => !row.rowType || row.rowType === 'quest');
    return {
        ...entry,
        completed:
            entry.kind === 'story' && template
                ? quests!.length > 0 &&
                  quests!.every(
                      (row) => storyRowDone({ ...entry, ...player } as Entry, row),
                  )
                : player?.completed ?? false,
        quantity: player?.quantity ?? 0,
        target: player?.target ?? 90,
        ...(player?.storyRowCompletion ? { storyRowCompletion: player.storyRowCompletion } : {}),
        ...(player?.characterCollection ? { characterCollection: player.characterCollection } : {}),
    };
}
/** Whitelist catalog fields to keep player state and arbitrary imported properties out of shared content. */
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
        ...(entry.region !== globalThis.undefined ? { region: entry.region } : {}),
        ...(entry.maxStack !== globalThis.undefined ? { maxStack: entry.maxStack } : {}),
        ...(entry.startDate !== globalThis.undefined ? { startDate: entry.startDate } : {}),
        ...(entry.endDate !== globalThis.undefined ? { endDate: entry.endDate } : {}),
        ...(entry.eventType !== globalThis.undefined ? { eventType: entry.eventType } : {}),
        ...(entry.characterDefinition !== globalThis.undefined ? { characterDefinition: entry.characterDefinition } : {}),
        ...(entry.characterInformation !== globalThis.undefined ? { characterInformation: entry.characterInformation } : {}),
        ...(entry.lore !== globalThis.undefined ? { lore: entry.lore } : {}),
        ...(entry.worldQuests !== globalThis.undefined ? { worldQuests: entry.worldQuests } : {}),
        ...(entry.eventStory !== globalThis.undefined ? { eventStory: entry.eventStory } : {}),
        ...(entry.sideStories !== globalThis.undefined ? { sideStories: entry.sideStories } : {}),
        ...(entry.mainStory !== globalThis.undefined ? { mainStory: entry.mainStory } : {}),
        ...(entry.patchOverview !== globalThis.undefined ? { patchOverview: entry.patchOverview } : {}),
        ...(entry.storySection !== globalThis.undefined ? { storySection: entry.storySection } : {}),
        ...(entry.icon !== globalThis.undefined ? { icon: entry.icon } : {}),
        ...(entry.sectionImageUrl !== globalThis.undefined ? { sectionImageUrl: entry.sectionImageUrl } : {}),
        ...(entry.wikiUrl !== globalThis.undefined ? { wikiUrl: entry.wikiUrl } : {}),
        ...(entry.reward !== globalThis.undefined ? { reward: entry.reward } : {}),
        ...(entry.rewardIcon !== globalThis.undefined ? { rewardIcon: entry.rewardIcon } : {}),
        ...(entry.description !== globalThis.undefined ? { description: entry.description } : {}),
        ...(entry.requirementText !== globalThis.undefined ? { requirementText: entry.requirementText } : {}),
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
        'region',
        'maxStack',
        'startDate',
        'endDate',
        'eventType',
        'icon',
        'sectionImageUrl',
        'wikiUrl',
        'reward',
        'rewardIcon',
        'description',
        'requirementText',
        'storySection',
        'patchOverview',
        'mainStory',
        'sideStories',
        'eventStory',
        'worldQuests',
        'lore',
        'characterInformation',
        'characterDefinition',
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
                e.storySection === globalThis.undefined ||
                ids.get(e.storySection)?.kind === 'story-category') &&
            e.members.every((id) => ids.get(id)?.kind === 'characters') &&
            (e.characterDefinition?.recipes ?? []).every(recipe => recipe.materials.every(cost => ids.get(cost.item)?.kind === 'inventory')) &&
            e.requirements.every((r) => ids.get(r.item)?.kind === 'inventory'),
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
        !validEntries(data.entries) ||
        ('characterRules' in data && (!data.characterRules || typeof data.characterRules !== 'object' || Array.isArray(data.characterRules) ||
            !Object.entries(data.characterRules).every(([game, rules]) => GAMES.some(item => item.id === game) && validCharacterRules(rules))))
    ) {
        throw new Error('Invalid workspace backup');
    }
    return migrateStory(migrateAchievements(data.entries));
}
