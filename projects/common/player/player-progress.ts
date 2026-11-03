import type { PlayerState } from '../../lib/types/workspace.type';
import { GAMES } from '../../lib/constants/workspace.constants';
import { validRowCompletion } from '../quests/story-template';
import { validCharacterCollection } from '../characters/characters';
import { TEAM_PROGRESS_ID } from '../../lib/constants/team.constants';
import { validTeams } from './teams';
export function safeId(id: string): boolean {
    return (
        id.length > 0 &&
        id.length <= 300 &&
// eslint-disable-next-line no-control-regex -- Reject ASCII control characters in untrusted identifiers.
        !/[.$\x00-\x1f]/.test(id) &&
        !['__proto__', 'constructor', 'prototype'].includes(id)
    );
}


export function validPlayerState(value: unknown): value is PlayerState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {return false;}
    const state = value as PlayerState;
    return (
        Object.keys(state).every((key) =>
            ['completed', 'quantity', 'target', 'storyRowCompletion', 'characterCollection', 'teams'].includes(key),
        ) &&
        typeof state.completed === 'boolean' &&
        (typeof state.teams === 'undefined' || validTeams(state.teams)) &&
        [state.quantity, state.target].every(
            (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e9,
        ) &&
        validRowCompletion(state.storyRowCompletion) &&
        (state.characterCollection === globalThis.undefined || validCharacterCollection(state.characterCollection)) &&
        Object.keys(state.storyRowCompletion ?? {}).length <= 10000 &&
        Object.keys(state.storyRowCompletion ?? {}).every(safeId)
    );
}
export function validProgressState(value: unknown): value is Record<string, PlayerState> {
    return (
        !!value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).length <= 20000 &&
        Object.entries(value).every(([key, state]) => {
            const slash = key.indexOf('/');
            return (
                slash > 0 &&
                GAMES.some((game) => game.id === key.slice(0, slash)) &&
                safeId(key.slice(slash + 1)) &&
                validPlayerState(state) &&
                (key.slice(slash + 1) === TEAM_PROGRESS_ID
                    ? Array.isArray(state.teams) && !state.completed && state.quantity === 0 && state.target === 0 && !state.characterCollection && !state.storyRowCompletion
                    : typeof state.teams === 'undefined')
            );
        })
    );
}
