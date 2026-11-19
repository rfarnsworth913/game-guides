import type { CharacterCollection, CharacterDefinition, CharacterProgression, CharacterRules } from '../../lib/types/character.type';
import type { ProgressionTrackDefinition } from '../../lib/types/character-extension.type';
import { trackAllows, trackMaximum, trackMinimum, validProgressionGraph } from './character-extension';

export function characterTrackValue(state: CharacterProgression, track: ProgressionTrackDefinition): number {
    const binding = track.storage ?? (track.type === 'level' ? { field: 'level' as const } : track.type === 'ascension' ? { field: 'ascensionRank' as const } : null);
    if (binding) {
        if (binding.field === 'level') {return state.level;}
        if (binding.field === 'ascensionRank') {return state.ascensionRank ?? 0;}
        return state[binding.field]?.[binding.key!] ?? trackMinimum(track);
    }
    return track.type === 'unlock' ? Number(state.nodeStates?.[track.id]?.unlocked ?? false) : state.trackValues?.[track.id] ?? trackMinimum(track);
}
const bound = (track: ProgressionTrackDefinition) => !!track.storage || track.type === 'level' || track.type === 'ascension';

export function characterProfileTracks(rules: CharacterRules, definition?: CharacterDefinition): ProgressionTrackDefinition[] {
    const profile = rules.progressionProfiles?.find(profile => profile.id === (definition?.progressionProfileId ?? rules.defaultProgressionProfileId));
    return (profile?.tracks ?? []).map(track => definition?.progressionOverrides?.find(override => override.id === track.id) ?? track).slice().sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id));
}
export function characterExtensionFits(definition: CharacterDefinition, rules: CharacterRules): boolean {
    const profile = rules.progressionProfiles?.find(profile => profile.id === (definition.progressionProfileId ?? rules.defaultProgressionProfileId));
    if (definition.progressionProfileId && !profile) {return false;}
    if (definition.progressionOverrides?.some(track => !profile?.tracks.some(base => base.id === track.id))) {return false;}
    const tracks = characterProfileTracks(rules, definition);
    if (!validProgressionGraph(tracks)) {return false;}
    if (definition.abilities?.some(ability => ability.progressionTrackId && !tracks.some(track => track.id === ability.progressionTrackId))) {return false;}
    if (tracks.some(track => track.abilityId && !definition.abilities?.some(ability => ability.id === track.abilityId))) {return false;}
    const values = { weaponType: definition.weaponType, damageType: definition.damageType, roles: definition.roles, ...definition.attributes };
    if (rules.attributes?.some(attribute => attribute.required && (values[attribute.id as keyof typeof values] === globalThis.undefined || values[attribute.id as keyof typeof values] === '' || (Array.isArray(values[attribute.id as keyof typeof values]) && !(values[attribute.id as keyof typeof values] as string[]).length)))) {return false;}
    return Object.entries(definition.attributes ?? {}).every(([id, value]) => {
        const attribute = rules.attributes?.find(attribute => attribute.id === id);
        if (!attribute) {return true;} // Preserve safe unknown metadata for fallback rendering.
        if (attribute.type === 'number') {return typeof value === 'number';}
        if (attribute.type === 'boolean') {return typeof value === 'boolean';}
        if (attribute.type === 'multi-select') {return Array.isArray(value) && value.every(item => attribute.options?.includes(item));}
        return typeof value === 'string' && (attribute.type !== 'enum' || !!attribute.options?.includes(value));
    });
}
export type CharacterProgressIssue = { trackId: string; state: 'current' | 'target'; message: string };
/** Invested numeric values and independent unlock nodes share dependency checking. */
export function characterProgressIssues(collection: CharacterCollection, rules: CharacterRules, definition?: CharacterDefinition, previous?: CharacterCollection): CharacterProgressIssue[] {
    const tracks = characterProfileTracks(rules, definition), byId = new Map(tracks.map(track => [track.id, track]));
    const issues: CharacterProgressIssue[] = [];
    const amount = (state: CharacterProgression, id: string): number => {
        const track = byId.get(id);
        return track ? characterTrackValue(state, track) : state.trackValues?.[id] ?? Number(state.nodeStates?.[id]?.unlocked ?? false);
    };
    const changed = (state: CharacterProgression, old: CharacterProgression | undefined, id: string) => !old || amount(state, id) !== amount(old, id) || state.trackValues?.[id] !== old.trackValues?.[id] || state.nodeStates?.[id]?.unlocked !== old.nodeStates?.[id]?.unlocked;
    const check = (state: CharacterProgression, kind: 'current' | 'target', old?: CharacterProgression) => {
        for (const id of new Set([...Object.keys(state.trackValues ?? {}), ...Object.keys(state.nodeStates ?? {}), ...tracks.filter(bound).map(track => track.id)])) {
            const track = byId.get(id), value = amount(state, id);
            const fail = (message: string) => {
                // Profile edits cannot silently erase history or prevent saving unrelated personal notes.
                // A changed dependency must still revalidate every dependent track.
                if (changed(state, old, id) || (kind === 'target' && previous && amount(collection, id) !== amount(previous, id)) || (track?.dependencies ?? []).some(dependency => amount(state, dependency.trackId) !== (old ? amount(old, dependency.trackId) : 0))) {issues.push({ trackId: id, state: kind, message });}
            };
            if (!track) {fail('This track is not in the character progression profile.'); continue;}
            if ((bound(track) && state.trackValues?.[id] !== globalThis.undefined) || (track.type === 'unlock' && state.trackValues?.[id] !== globalThis.undefined) || (track.type !== 'unlock' && state.nodeStates?.[id] !== globalThis.undefined) || !trackAllows(track, value)) {fail('Value or node type is outside the configured progression rules.'); continue;}
            if (value > trackMinimum(track) && (track.dependencies ?? []).some(dependency => amount(state, dependency.trackId) < dependency.requiredValue)) {fail('Progression prerequisites have not been met.');}
            if (kind === 'target' && value < amount(collection, id)) {fail('A target cannot be below current invested progression.');}
        }
    };
    check(collection, 'current', previous);
    if (collection.target) {
        const target = { ...collection.target, trackValues: { ...collection.trackValues, ...collection.target.trackValues }, nodeStates: { ...collection.nodeStates, ...collection.target.nodeStates } };
        const old = previous?.target ? { ...previous.target, trackValues: { ...previous.trackValues, ...previous.target.trackValues }, nodeStates: { ...previous.nodeStates, ...previous.target.nodeStates } } : previous;
        check(target, 'target', old);
    }
    return issues;
}
export function characterTrackProgress(collection: CharacterCollection, rules: CharacterRules, definition?: CharacterDefinition) {
    return characterProfileTracks(rules, definition).map(track => {
        const current = characterTrackValue(collection, track);
        const target = collection.target ? characterTrackValue({ ...collection, ...collection.target, trackValues: { ...collection.trackValues, ...collection.target.trackValues }, nodeStates: { ...collection.nodeStates, ...collection.target.nodeStates } }, track) : current;
        return { track, current, target, maximum: trackMaximum(track), remaining: Math.max(0, target - current), reached: current >= target };
    });
}
