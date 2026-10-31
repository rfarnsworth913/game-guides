import type { CatalogEntry, PlayerState } from '../../../../lib/types/workspace.type';
import type { CharacterRules } from '../../../../lib/types/character.type';
import { ApiError } from '../../core/errors/app-error';
import { characterCollectionFits } from '../../../../common/characters/characters';
export function validateCharacterProgress(entry: CatalogEntry, state: PlayerState, rules?: CharacterRules): void {
    if (state.characterCollection) {
        if (entry.kind !== 'characters' || ((state.characterCollection.owned || state.characterCollection.target) && (!rules || !characterCollectionFits(state.characterCollection, rules, entry.characterDefinition)))) {
            throw new ApiError(400, 'Character level, equipment, or progression does not match this game\'s rules.');
        }
    }
}
