import { RequestError, type WorkspaceApi } from './workspace-api';
import { mergeUpdates } from '../merge-updates';
import type { GameSnapshot } from '@lib/types/workspace.type';
import type { CharacterRules } from '@lib/types/character.type';
import type { GameRegistration } from '@lib/types/games.type';
import { GAMES } from '@lib/constants/workspace.constants';
import { validCatalog } from '@common/workspace/workspace';
import { validCharacterRules } from '@common/characters/characters';
import { defaultGameOverview, validGameOverview } from '@common/workspace/game-overview';

/** Catalog transport and optimistic concurrency, independent of feature state. */
export class CatalogClient {
    constructor(private readonly api: WorkspaceApi) {}
    async writeCatalog(base: GameSnapshot, edited: GameSnapshot['entries'], editedRules?: CharacterRules): Promise<GameSnapshot> {
        let current = base;
        let entries = edited;
        let rules = editedRules;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                return this.snapshot(await this.api.request(`games/${base.id}/catalog`, { revision: current.revision, entries, ...(rules ? { characterRules: rules } : {}) }));
            } catch (error) {
                if (!(error instanceof RequestError) || error.status !== 409) {throw error;}
                current = this.snapshot(await this.api.request(`games/${base.id}`));
                if (current.id !== base.id) {throw new Error('Invalid game response.', { cause: error });}
                const index = (values: GameSnapshot['entries']) => Object.fromEntries(values.map(entry => [entry.id, entry]));
                entries = Object.values(mergeUpdates(index(base.entries), index(edited), index(current.entries)));
                if (editedRules) {rules = mergeUpdates(base.characterRules, editedRules, current.characterRules);}
                if (!validCatalog(entries, base.id)) {throw new Error('Another tab changed related guide content. Review the latest guide before retrying.', { cause: error });}
            }
        }
        throw new Error('This game is being updated repeatedly. Your edit is still open; try saving again shortly.');
    }
    snapshot(value: unknown): GameSnapshot {
        if (
            !value ||
            typeof value !== 'object' ||
            !('id' in value) ||
            typeof value.id !== 'string' ||
            !('revision' in value) ||
            !Number.isSafeInteger(value.revision) ||
            Number(value.revision) < 0 ||
            !('entries' in value) ||
            !validCatalog(value.entries, value.id)
            || ('characterRules' in value && !validCharacterRules(value.characterRules))
            || ('overview' in value && (!validGameOverview(value.overview) || value.overview.gameId !== value.id))
        ) {
            throw new Error('Invalid game data received from middleware.');
        }
        return {
            id: value.id,
            name: 'overview' in value ? (value.overview as GameRegistration).name : GAMES.find((g) => g.id === value.id)?.name ?? value.id,
            revision: Number(value.revision),
            entries: value.entries,
            ...('characterRules' in value ? { characterRules: value.characterRules as CharacterRules } : {}),
            overview: 'overview' in value ? value.overview as GameRegistration : defaultGameOverview(value.id),
        };
    }
}
