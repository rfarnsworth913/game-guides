import { validateInventoryProgress } from '../inventory/inventory.service';
import { validateCharacterProgress } from '../characters/characters.service';
import { validateTeamProgress } from '../teams/teams.service';
import { validateStoryProgress } from '../documents/stories/story-progress.service';
import { resolveCharacterReferences } from '../../../../common/characters/character-story';
import { resolveEventReferences } from '../../../../common/events/event-story';
import { sharedEventState, setEventCompletion } from '../../../../common/events/event-progress';
import type { PlayerState } from '../../../../lib/types/workspace.type';
import type { CatalogRepository, AccountProgressRepository } from '../../app/app.types';
import { ApiError } from '../../core/errors/app-error';
import { validProgressState } from '../../../../common/player/player-progress';
import { TEAM_PROGRESS_ID } from '../../../../lib/constants/team.constants';
import {equipmentAccountIssues} from '../../../../common/characters/character-equipment';
export class ProgressService {
    constructor(private readonly repository: CatalogRepository, private readonly progress: AccountProgressRepository) { }
    async patch(userId: string, body: unknown) {
        const { repository, progress } = this;
        if (!body || typeof body !== 'object' || Object.keys(body).some((key) => !['revision', 'changes'].includes(key)) ||
            !('revision' in body) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0 ||
            !('changes' in body) || !validProgressState(body.changes, null))
            {throw new ApiError(400, 'Invalid progress update.');}
        const previous = await progress.read(userId);
        const requestedChanges = body.changes;
        const changes: Record<string, PlayerState> = {};
        if (previous.revision !== body.revision)
            {throw new ApiError(409, 'Progress changed in another browser. Reload before retrying.');}
        const catalogs = new Map<string, Map<string, Awaited<ReturnType<typeof repository.read>>['entries'][number]>>();
        const gameRules = new Map<string, Awaited<ReturnType<typeof repository.read>>['characterRules']>();
        for (const [key, state] of Object.entries(body.changes)) {
            const slash = key.indexOf('/');
            const game = key.slice(0, slash);
            const id = key.slice(slash + 1);
            if (!catalogs.has(game)) {
                const snapshot = await repository.read(game);
                catalogs.set(game, new Map(resolveEventReferences(resolveCharacterReferences(snapshot.entries)).map((entry) => [entry.id, entry])));
                gameRules.set(game, snapshot.characterRules);
            }
            if (id === TEAM_PROGRESS_ID) {
                validateTeamProgress(game, key, state, previous.state, requestedChanges, catalogs.get(game)!, gameRules.get(game));
                changes[key] = state;
                continue;
            }
            const entry = catalogs.get(game)!.get(id);
            if (!entry)
                {throw new ApiError(400, 'Progress references unknown content.');}
            const event = entry.eventId ? catalogs.get(game)!.get(entry.eventId) : entry.kind === 'events' ? entry : null;
            if (event) {
                const destination = `${game}/${event.id}`;
                let normalized: PlayerState;
                try {
                    normalized = state.storyRowCompletion === globalThis.undefined
                        ? setEventCompletion(event, state.completed, { ...previous.state[destination], ...state })
                        : sharedEventState(event, state);
                } catch (error) {throw new ApiError(400, error instanceof Error ? error.message : 'Invalid event progress.');}
                if (changes[destination] && JSON.stringify(changes[destination]) !== JSON.stringify(normalized)) {throw new ApiError(400, 'Conflicting updates to the same shared event.');}
                validateStoryProgress(event, normalized, previous.state[destination]?.storyRowCompletion ?? previous.state[key]?.storyRowCompletion ?? {});
                changes[destination] = normalized;
                continue;
            }
            validateInventoryProgress(entry, state);
            validateCharacterProgress(entry, state, gameRules.get(game), previous.state[key]);
            validateStoryProgress(entry, state, previous.state[key]?.storyRowCompletion ?? {});
            changes[key] = state;
        }
        for (const [game, catalog] of catalogs) {
            const issues = equipmentAccountIssues([...catalog.values()], {...previous.state,...changes}, gameRules.get(game));
            if (issues.length) {throw new ApiError(400, issues.join(' '));}
        }
        return progress.patch(userId, Number(body.revision), changes);
    }
}
