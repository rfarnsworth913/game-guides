import type { CharacterDefinition, CharacterProgression, CharacterCollection, CharacterRules } from '../../lib/types/character.type';
import type { ProgressionTrackDefinition } from '../../lib/types/character-extension.type';
import { characterProfileTracks, characterTrackValue } from './character-progression';
import { trackMinimum, trackMaximum } from './character-extension';

/** Effective controls use existing profile overrides; legacy fields are projected, not migrated. */
export function characterDetailsTracks(rules: CharacterRules, definition?: CharacterDefinition): ProgressionTrackDefinition[] {
    if (definition?.attributes?.['playable'] === false) {return [];}
    if (definition?.progressionProfileId || rules.defaultProgressionProfileId) {return characterProfileTracks(rules, definition);}
    const tracks: ProgressionTrackDefinition[] = [{ id: 'level', label: 'Character level', type: 'level', minValue: 1, maxValue: rules.levelCap, displayOrder: 0 }];
    if (rules.ascensionRanks?.length) {tracks.push({id:'ascension', label:'Ascension rank', type:'ascension', minValue:0, maxValue:rules.ascensionRanks.length - 1, displayOrder:1});}
    for (const [index, skill] of [...(definition?.skills ?? []), ...(definition?.passiveSkills ?? [])].entries()) {
        const active = index < (definition?.skills.length ?? 0);
        const key = skill.id ?? (active ? `skill-${index}` : `passive-${index - (definition?.skills.length ?? 0)}`);
        if ((skill.maxLevel ?? 1) > 1) {tracks.push({id:`skill-${key}`, label:skill.name, type:'skill', minValue:1, maxValue:skill.maxLevel, displayOrder:tracks.length, storage:{field:'skillLevels', key}});}
    }
    for (const track of rules.progressionTracks) {tracks.push({id:track.id, label:track.label, type:'custom', minValue:0, maxValue:track.max, displayOrder:tracks.length, storage:{field:'progression', key:track.id}});}
    return tracks;
}
export function characterTarget(collection: CharacterCollection): CharacterProgression {
    const {level, ascensionRank, skillLevels, gear, progression, trackValues, nodeStates} = collection;
    collection.target ??= structuredClone({level, ...(ascensionRank !== globalThis.undefined ? {ascensionRank} : {}), ...(skillLevels ? {skillLevels} : {}), gear, progression, ...(trackValues ? {trackValues} : {}), ...(nodeStates ? {nodeStates} : {})});
    return collection.target;
}
export function setCharacterTrack(state: CharacterProgression, track: ProgressionTrackDefinition, value: number): void {
    const storage = track.storage ?? (track.type === 'level' ? {field:'level' as const} : track.type === 'ascension' ? {field:'ascensionRank' as const} : null);
    if (storage?.field === 'level') {state.level = value;}
    else if (storage?.field === 'ascensionRank') {state.ascensionRank = value;}
    else if (storage) {(state[storage.field] ??= {})[storage.key!] = value;}
    else if (track.type === 'unlock') {(state.nodeStates ??= {})[track.id] = {unlocked:value === 1};}
    else {(state.trackValues ??= {})[track.id] = value;}
}
export function requiredPromotion(rules: CharacterRules, level: number): number | null {
    if (!rules.ascensionRanks?.length) {return level <= rules.levelCap ? 0 : null;}
    const rank = rules.ascensionRanks.findIndex(rank => level <= rank.levelCap);
    return rank < 0 ? null : rank;
}
export function trackGoalPercent(current: CharacterProgression, target: CharacterProgression, tracks: ProgressionTrackDefinition[]): number {
    const goals = tracks.filter(track => characterTrackValue(target, track) > trackMinimum(track));
    if (!goals.length) {return 100;}
    return Math.round(goals.reduce((total, track) => total + Math.max(0, Math.min(1, (characterTrackValue(current, track) - trackMinimum(track)) / (characterTrackValue(target, track) - trackMinimum(track)))), 0) / goals.length * 100);
}
export function progressionCap(rules: CharacterRules, state: CharacterProgression, track: ProgressionTrackDefinition): number {
    const rank = rules.ascensionRanks?.[state.ascensionRank ?? 0];
    if (track.type === 'level' || track.storage?.field === 'level') {return Math.min(trackMaximum(track), rank?.levelCap ?? rules.levelCap);}
    if (track.storage?.field === 'skillLevels') {return Math.min(trackMaximum(track), rank?.skillLevelCap ?? trackMaximum(track));}
    return trackMaximum(track);
}
