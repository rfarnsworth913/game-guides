import type { CharacterCollection, CharacterRules } from '@lib/types/character.type';
import type { Entry } from '@lib/types/workspace.type';
import { characterCollectionFits, validCharacterCollection } from '@common/characters/characters';
import { equipmentAccountIssues } from '@common/characters/character-equipment';
import { toCatalog } from '@common/workspace/workspace';

/** Validate detached character drafts before the facade coordinates persistence. */
export function collectionEdit(entries: Entry[], rules: Record<string, CharacterRules>, id: string, collection: CharacterCollection): Entry {
    const entry = entries.find(item => item.id === id && item.kind === 'characters');
    const configuration = entry && rules[entry.game];
    if (!entry || !validCharacterCollection(collection) || ((collection.owned || collection.target || Object.keys(collection.trackValues ?? {}).length || Object.keys(collection.nodeStates ?? {}).length) &&
        (!configuration || !characterCollectionFits(collection, configuration, entry.characterDefinition, entry.characterCollection)))) {
        throw new Error("Check this character's level, equipment, and progression against the game rules.");
    }
    return { ...entry, characterCollection: structuredClone(collection) };
}

export function characterDetailsEdits(entries: Entry[], rules: Record<string, CharacterRules>, id: string, collection: CharacterCollection, inventory: Entry[]): Entry[] {
    const entry = entries.find(item => item.id === id && item.kind === 'characters');
    if (!entry || !validCharacterCollection(collection) || !rules[entry.game] || !characterCollectionFits(collection, rules[entry.game], entry.characterDefinition, entry.characterCollection)) {
        throw new Error('Check character progression against the game rules.');
    }
    const drafts = new Map(inventory.map(item => [item.id, item]));
    const edited = entries.map(item => item.id === id && item.game === entry.game ? { ...item, characterCollection: structuredClone(collection) }
        : item.game === entry.game && item.kind === 'inventory' && drafts.has(item.id) ? { ...item, equipmentInstances: structuredClone(drafts.get(item.id)!.equipmentInstances) } : item);
    const gameEntries = edited.filter(item => item.game === entry.game);
    const state = Object.fromEntries(gameEntries.map(item => [`${item.game}/${item.eventId ?? item.id}`, {
        completed: item.completed, quantity: item.quantity, target: item.target, characterCollection: item.characterCollection, equipmentInstances: item.equipmentInstances,
    }]));
    const issues = equipmentAccountIssues(gameEntries.map(toCatalog), state, rules[entry.game]);
    if (issues.length) {throw new Error(issues.join(' '));}
    return edited;
}
