import type { CatalogEntry, PlayerState } from '../../../../../lib/types/workspace.type';
import { ApiError } from '../../../core/errors/app-error';
import { fromCatalog } from '../../../../../common/workspace/workspace';
import { storyCompletionKey } from '../../../../../common/quests/story-guide';
export function validateStoryProgress(entry: CatalogEntry, state: PlayerState, history: Record<string, boolean>): void {
    const rows = [entry.patchOverview, entry.mainStory, entry.sideStories, entry.worldQuests, entry.lore, entry.eventStory, entry.characterInformation]
        .flatMap((template) => template?.rows ?? []).filter((row) => !row.rowType || row.rowType === 'quest');
    const definition = fromCatalog(entry);
    const rowIds = new Set(rows.flatMap(row => [row.id, storyCompletionKey(definition, row)].filter((id): id is string => id !== null)));
    // Template edits can retire rows or promote them to headings. Preserve existing
    // private history, but do not allow new or changed unknown completion keys.
    if (Object.entries(state.storyRowCompletion ?? {}).some(([id, value]) => !rowIds.has(id) &&
        !(Object.hasOwn(history, id) && history[id] === value)))
        throw new ApiError(400, 'Progress references unknown rows.');
}
