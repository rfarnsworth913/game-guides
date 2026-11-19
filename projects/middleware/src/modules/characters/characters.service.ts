import type { CatalogEntry, PlayerState } from '../../../../lib/types/workspace.type';
import type { CharacterRules } from '../../../../lib/types/character.type';
import { ApiError } from '../../core/errors/app-error';
import { characterCollectionFits } from '../../../../common/characters/characters';
export function validateCharacterProgress(entry: CatalogEntry, state: PlayerState, rules?: CharacterRules, previous?: PlayerState): void {
    if (state.characterCollection) {
        if (entry.kind !== 'characters' || ((state.characterCollection.owned || state.characterCollection.target || Object.keys(state.characterCollection.trackValues ?? {}).length || Object.keys(state.characterCollection.nodeStates ?? {}).length) && (!rules || !characterCollectionFits(state.characterCollection, rules, entry.characterDefinition, previous?.characterCollection)))) {
            throw new ApiError(400, 'Character level, equipment, or progression does not match this game\'s rules.');
        }
    }
}
