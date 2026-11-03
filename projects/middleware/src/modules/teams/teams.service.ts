import type { CatalogEntry, PlayerState } from '../../../../lib/types/workspace.type';
import type { CharacterRules } from '../../../../lib/types/character.type';
import { ApiError } from '../../core/errors/app-error';
import { teamSize } from '../../../../common/player/teams';
export function validateTeamProgress(game: string, key: string, state: PlayerState, previous: Record<string, PlayerState>, requestedChanges: Record<string, PlayerState>, catalog: Map<string, CatalogEntry>, rules?: CharacterRules): void {
    const existing = previous[key]?.teams ?? [];
    for (const team of state.teams ?? []) {
        if (JSON.stringify(existing.find(item => item.id === team.id)) === JSON.stringify(team))
            {continue;}
        if (team.members.length > teamSize(rules) || team.members.some(member => {
            const character = catalog.get(member);
            const owned = requestedChanges[`${game}/${member}`]?.characterCollection ?? previous[`${game}/${member}`]?.characterCollection;
            return character?.kind !== 'characters' || !owned?.owned;
        }))
            {throw new ApiError(400, 'Teams must fit the game size and use characters from your collection.');}
    }
}
