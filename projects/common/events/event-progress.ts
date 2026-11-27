import type { LegacyCatalogEntry, Entry, PlayerState } from '@lib/types/workspace.type';
import { storyCompletionKey, storyRowDone } from '@common/quests/story-guide';

export const eventObjectives = (entry: LegacyCatalogEntry) => entry.eventStory?.rows.filter(row => (!row.rowType || row.rowType === 'quest') && !row.optional) ?? [];
export function eventProgress(entry: Entry) {
    const rows = eventObjectives(entry);
    const completed = rows.filter(row => storyRowDone(entry, row)).length;
    const optional = entry.eventStory?.rows.filter(row => (!row.rowType || row.rowType === 'quest') && row.optional) ?? [];
    return { total: rows.length, completed, canComplete: rows.every(row => storyCompletionKey(entry, row) !== null), optionalTotal: optional.length, optionalCompleted: optional.filter(row => storyRowDone(entry, row)).length };
}
export function setEventCompletion(entry: LegacyCatalogEntry, completed: boolean, state: PlayerState): PlayerState {
    const storyRowCompletion = { ...state.storyRowCompletion };
    for (const row of eventObjectives(entry)) {
        const key = storyCompletionKey(entry as Entry, row);
        if (key === null) {throw new Error('Set an event cycle ID before changing its completion.');}
        storyRowCompletion[key] = completed;
    }
    return { ...state, completed, ...(eventObjectives(entry).length ? { storyRowCompletion } : {}) };
}

/** Canonical event progress wins; placement history is a read-only fallback until the next save. */
export function sharedEventState(entry: LegacyCatalogEntry, current?: PlayerState, legacy: PlayerState[] = []): PlayerState {
    const state: PlayerState = { completed: false, quantity: 0, target: 90, ...current };
    if (current?.storyRowCompletion === globalThis.undefined) {
        const history: Record<string, boolean> = {};
        for (const previous of legacy) {for (const [id, done] of Object.entries(previous.storyRowCompletion ?? {})) {history[id] = history[id] || done;}}
        if (Object.keys(history).length) {state.storyRowCompletion = history;}
        if ((current?.completed || (!current && legacy.some(previous => previous.completed))) && eventObjectives(entry).every(row => storyCompletionKey(entry as Entry, row) !== null)) {
            return setEventCompletion(entry, true, state);
        }
    }
    const rows = eventObjectives(entry);
    if (rows.length) {state.completed = rows.every(row => storyRowDone({ ...entry, ...state } as Entry, row));}
    return state;
}
