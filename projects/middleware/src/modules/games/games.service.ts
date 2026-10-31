import type { CatalogRepository } from '../../app/app.types';
import { ApiError } from '../../core/errors/app-error';
import { validCatalog } from '../../../../common/workspace/workspace';
import { validCharacterRules } from '../../../../common/characters/characters';
import type { CharacterRules } from '../../../../lib/types/character.type';
export class GamesService {
    constructor(private readonly repository: CatalogRepository) { }
    async write(id: string, body: unknown) {
        if (!body ||
            typeof body !== 'object' ||
            !('revision' in body) ||
            !Number.isSafeInteger(body.revision) ||
            Number(body.revision) < 0 ||
            !('entries' in body) ||
            !validCatalog(body.entries, id)) {
            throw new ApiError(400, 'Invalid catalog, references, or revision. Player state must not be sent to the server.');
        }
        if ('characterRules' in body && !validCharacterRules(body.characterRules))
            throw new ApiError(400, 'Invalid character rules.');
        return this.repository.write(id, body.entries, Number(body.revision), 'characterRules' in body ? body.characterRules as CharacterRules : undefined);
    }
}
