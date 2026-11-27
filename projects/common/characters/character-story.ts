import type { CatalogEntry, LegacyCatalogEntry } from '@lib/types/workspace.type';
import type { PatchOverview } from '@lib/types/story-template.type';
import { emptyPatchOverview } from '@common/quests/story-template';
import { applyPreservedFieldRemovals } from '@common/quests/story-preservation';

export const characterNameKey = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

/** A fresh view, never a mutable alias of the shared catalog or another placement. */
export function characterStoryProfile(character: LegacyCatalogEntry): PatchOverview {
    return { ...structuredClone(character.characterInformation ?? emptyPatchOverview()),
        characterName: character.name, summary: character.notes,
        damageType: character.characterDefinition?.damageType ?? character.characterInformation?.damageType ?? '' };
}
export function resolveCharacterReferences<T extends LegacyCatalogEntry>(entries: T[]): T[] {
    return entries.map(entry => {
        if (entry.kind !== 'story' || !entry.characterId) {return entry;}
        const character = entries.find(item => item.id === entry.characterId && item.game === entry.game && item.kind === 'characters');
        const profile = character ? applyPreservedFieldRemovals(entry, characterStoryProfile(character)) : null;
        return profile ? { ...entry, ...(entry.category === 'character-information' && !entry.storyContent ? { characterInformation: profile } : { storyContent: profile }) } : entry;
    });
}
/** Store profile presentation and lore once; the catalog name/description/damage type remain authoritative. */
export function editCharacterStory<T extends LegacyCatalogEntry>(character: T, draft: PatchOverview): T {
    const profile = structuredClone(draft);
    const name = profile.characterName?.trim() || character.name;
    const notes = profile.summary ?? character.notes;
    const damageType = profile.damageType ?? character.characterDefinition?.damageType ?? '';
    delete profile.characterName; delete profile.summary;
    if (character.characterDefinition) {delete profile.damageType;}
    return { ...character, name, notes, characterInformation: profile,
        ...(character.characterDefinition ? { characterDefinition: { ...character.characterDefinition, damageType } } : {}) };
}

function mergeProfiles(left: PatchOverview, right: PatchOverview, name: string): PatchOverview {
    const result = structuredClone(left);
    for (const [key, value] of Object.entries(right)) {
        if (key === 'rows' || key === 'groups') {continue;}
        const old = (result as unknown as Record<string, unknown>)[key];
        if (value === '' || value === globalThis.undefined) {continue;}
        if (old !== '' && old !== globalThis.undefined && JSON.stringify(old) !== JSON.stringify(value)) {
            throw new Error(`Character ${name}: conflicting ${key}; resolve the source records before migrating.`);
        }
        (result as unknown as Record<string, unknown>)[key] = structuredClone(value);
    }
    for (const field of ['groups', 'rows'] as const) {
        const merged = [...result[field] ?? []];
        for (const item of right[field] ?? []) {
            const old = merged.find(row => row.id === item.id);
            if (old && JSON.stringify(old) !== JSON.stringify(item)) {throw new Error(`Character ${name}: conflicting ${field} ID ${item.id}.`);}
            if (!old) {merged.push(structuredClone(item));}
        }
        if (field === 'rows') {result.rows = merged as PatchOverview['rows'];}
        else if (merged.length) {result.groups = merged as PatchOverview['groups'];}
    }
    return result;
}

/** Lossless, idempotent conversion. Ambiguous names and conflicting data require review. */
export function migrateStoryCharacters(entries: CatalogEntry[], makeId: (game: string, name: string) => string = () => crypto.randomUUID()): { entries: CatalogEntry[]; created: number; linked: number } {
    const result = structuredClone(entries);
    let created = 0, linked = 0;
    for (const story of result.filter(item => item.kind === 'story' && item.category === 'character-information' && !item.characterId)) {
        const source = story.storyContent ?? story.characterInformation ?? emptyPatchOverview();
        const name = source.characterName?.trim() || story.name.trim();
        if (!name) {throw new Error('A character story has no character name.');}
        const matches = result.filter(item => item.kind === 'characters' && item.game === story.game && characterNameKey(item.name) === characterNameKey(name));
        if (matches.length > 1) {throw new Error(`Character ${name}: multiple catalog matches; resolve duplicates before migrating.`);}
        let character = matches[0];
        if (!character) {
            const id = makeId(story.game, name);
            if (result.some(item => item.id === id)) {throw new Error(`Character ID collision for ${name}.`);}
            character = { id, game: story.game, kind: 'characters', name, notes: '', category: '', rarity: 0, members: [], requirements: [], day: '', order: result.filter(item => item.kind === 'characters' && item.game === story.game).length,
                ...(source.imageUrl ? { icon: source.imageUrl } : {}) };
            result.push(character); created++;
        }
        const incoming = structuredClone(source);
        delete incoming.characterName; delete incoming.summary;
        if (character.characterDefinition) {
            if (incoming.damageType && character.characterDefinition.damageType && incoming.damageType !== character.characterDefinition.damageType) {throw new Error(`Character ${name}: conflicting damage types.`);}
            if (incoming.damageType && !character.characterDefinition.damageType) {character.characterDefinition.damageType = incoming.damageType;}
            delete incoming.damageType;
        }
        character.characterInformation = character.characterInformation ? mergeProfiles(character.characterInformation, incoming, name) : incoming;
        if (source.summary?.trim() && !character.notes.includes(source.summary.trim())) {character.notes = [character.notes, source.summary.trim()].filter(Boolean).join('\n\n');}
        story.characterId = character.id;
        delete story.characterInformation;
        delete story.storyContent;
        linked++;
    }
    return { entries: result, created, linked };
}
