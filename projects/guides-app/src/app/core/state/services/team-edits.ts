import type { Entry } from '@lib/types/workspace.type';
import type { Team } from '@lib/types/team.type';
import type { CharacterRules } from '@lib/types/character.type';
import { teamSize, validTeams } from '@common/player/teams';

export function mergeTeamEdits(value: unknown, entries: Entry[], gameIds: string[], rules: Record<string, CharacterRules>, teams: Record<string, Team[]>): Record<string, Team[]> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {throw new Error('Invalid team data.');}
    const updates: Record<string, Team[]> = {};
    for (const [game, incoming] of Object.entries(value)) {
        if (!gameIds.includes(game) || !validTeams(incoming)) {throw new Error('Invalid team data.');}
        const existing = teams[game] ?? [];
        for (const team of incoming) {
            // Legacy compatibility: unchanged historical teams remain readable under newer game rules.
            if (JSON.stringify(existing.find(item => item.id === team.id)) === JSON.stringify(team)) {continue;}
            if (team.members.length > teamSize(rules[game]) || team.members.some(id => !entries.some(entry => entry.game === game && entry.id === id && entry.kind === 'characters' && entry.characterCollection?.owned))) {
                throw new Error("Choose characters from your collection and stay within this game's team size.");
            }
        }
        const merged = new Map(existing.map(team => [team.id, team]));
        incoming.forEach(team => merged.set(team.id, structuredClone(team)));
        updates[game] = [...merged.values()];
    }
    return updates;
}
