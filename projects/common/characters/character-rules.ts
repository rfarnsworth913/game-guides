import type { CharacterRules } from '@lib/types/character.type';
import { trackMinimum, trackMaximum } from '@common/characters/character-extension';

/** Conservative protection for shared definitions: account progress may exist outside the loaded catalog. */
export function characterRulesCompatibility(previous: CharacterRules | undefined, next: CharacterRules): string[] {
    if (!previous) {return [];}
    const issues: string[] = [];
    if (next.levelCap < previous.levelCap || previous.progressionTracks.some(old => {
        const track = next.progressionTracks.find(track => track.id === old.id);
        return !track || track.max < old.max;
    }) || previous.equipmentSlots.some(old => {
        const slot = next.equipmentSlots.find(slot => slot.id === old.id);
        return !slot || slot.limit < old.limit;
    }) || (previous.ascensionRanks ?? []).some((old, index) => {
        const rank = next.ascensionRanks?.[index];
        return !rank || rank.levelCap < old.levelCap || rank.skillLevelCap < old.skillLevelCap;
    })) {issues.push('Reducing existing progression/equipment limits or removing slots/ranks requires an explicit migration.');}
    for (const old of previous.attributes ?? []) {
        const attribute = next.attributes?.find(attribute => attribute.id === old.id);
        if (!attribute || attribute.type !== old.type || old.options?.some(option => !attribute.options?.includes(option))) {
            issues.push(`Attribute ${old.label}: removing definitions/options or changing types requires an explicit migration.`);
        }
    }
    for (const old of previous.progressionProfiles ?? []) {
        const profile = next.progressionProfiles?.find(profile => profile.id === old.id);
        if (!profile) {issues.push(`Profile ${old.id}: removal requires an explicit migration.`); continue;}
        for (const track of old.tracks) {
            const changed = profile.tracks.find(candidate => candidate.id === track.id);
            if (!changed || changed.type !== track.type || JSON.stringify(changed.storage) !== JSON.stringify(track.storage) ||
                trackMinimum(changed) > trackMinimum(track) || trackMaximum(changed) < trackMaximum(track) ||
                (changed.levels && (!track.levels || track.levels.some(level => !changed.levels?.includes(level)))) ||
                JSON.stringify(changed.dependencies ?? []) !== JSON.stringify(track.dependencies ?? [])) {
                issues.push(`Track ${track.label}: removal, type/storage changes, narrowed values or changed prerequisites require an explicit migration.`);
            }
        }
    }
    if (previous.defaultProgressionProfileId !== next.defaultProgressionProfileId) {
        // Reinterpreting unassigned characters also affects accounts outside this editor.
        issues.push('Changing the default progression profile requires an explicit migration for characters without a profile.');
    }
    return issues;
}
