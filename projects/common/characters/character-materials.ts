import type {CharacterDefinition, CharacterCollection, CharacterRules, CharacterProgression} from '../../lib/types/character.type';
import type {ProgressionTrackDefinition} from '../../lib/types/character-extension.type';
import type {CharacterCost} from '../../lib/types/farming.type';
import {characterTrackValue} from './character-progression';
import {trackMinimum} from './character-extension';
import {characterDetailsTracks} from './character-details';

/** Cost each required track once, including shared prerequisites. Missing/ambiguous paths stay explicit. */
export function progressionMaterialCosts(tracks: ProgressionTrackDefinition[], current: CharacterProgression, target: CharacterProgression, selected?:string[]): CharacterCost {
    const costs = new Map<string, number>(), issues: string[] = [], desired = new Map<string, number>();
    const visiting = new Set<string>();
    const requireTrack = (track: ProgressionTrackDefinition, value: number) => {
        if (visiting.has(track.id)) {issues.push(`${track.label}: circular prerequisite.`); return;}
        if ((desired.get(track.id) ?? -1) >= value) {return;}
        desired.set(track.id, Math.max(desired.get(track.id) ?? characterTrackValue(current, track), value));
        if (value <= trackMinimum(track)) {return;}
        visiting.add(track.id);
        for (const dependency of track.dependencies ?? []) {
            const parent = tracks.find(candidate => candidate.id === dependency.trackId);
            if (parent) {requireTrack(parent, dependency.requiredValue);} else {issues.push(`${track.label}: missing prerequisite ${dependency.trackId}.`);}
        }
        visiting.delete(track.id);
    };
    tracks.filter(track => !selected || selected.includes(track.id)).forEach(track => requireTrack(track, characterTrackValue(target, track)));
    for (const track of tracks) {
        const from = characterTrackValue(current, track), to = desired.get(track.id) ?? from;
        if (to <= from) {continue;}
        const transitions = track.upgradeCosts ?? [];
        const memo = new Map<number,typeof transitions[]>();
        const search = (value: number):typeof transitions[] => {
            if (value === to) {return [[]];}
            const cached = memo.get(value); if (cached) {return cached;}
            const paths:typeof transitions[] = [];
            for (const step of transitions.filter(step => step.fromValue === value && step.toValue <= to && step.toValue > value)) {
                for (const rest of search(step.toValue)) {paths.push([step,...rest]);if(paths.length === 2){memo.set(value,paths);return paths;}}
            }
            memo.set(value,paths);return paths;
        };
        const paths = search(from);
        if (paths.length !== 1) {issues.push(`${track.label}: ${paths.length ? 'multiple upgrade paths; choose/configure a single path' : 'upgrade costs unavailable for the full target range'}.`); continue;}
        for (const step of paths[0]!) {for (const material of step.materials) {costs.set(material.itemId, (costs.get(material.itemId) ?? 0) + material.quantity);}}
    }
    return {costs, issues};
}
export function characterMaterialCosts(definition: CharacterDefinition | undefined, collection: CharacterCollection, rules: CharacterRules, selected?:string[]): CharacterCost {
    if (!collection.target) {return {costs:new Map(), issues:['No development goal set.']};}
    const tracks = characterDetailsTracks(rules, definition).map(track => {
        if (track.upgradeCosts) {return track;}
        const storage = track.storage ?? (track.type === 'level' ? {field:'level'} : track.type === 'ascension' ? {field:'ascensionRank'} : null);
        const kind = storage?.field === 'level' ? 'level' : storage?.field === 'ascensionRank' ? 'ascension' : storage?.field === 'skillLevels' ? 'skill' : storage?.field === 'progression' ? 'progression' : null;
        return {...track, upgradeCosts:kind ? (definition?.recipes ?? []).filter(recipe => recipe.kind === kind && (recipe.key ?? '') === ('key' in storage! ? storage!.key : '')).map(recipe => ({fromValue:recipe.from, toValue:recipe.to, materials:recipe.materials.map(material => ({itemId:material.item, quantity:material.amount}))})) : []};
    });
    return progressionMaterialCosts(tracks, collection, {...collection, ...collection.target, trackValues:{...collection.trackValues, ...collection.target.trackValues}, nodeStates:{...collection.nodeStates, ...collection.target.nodeStates}},selected);
}
