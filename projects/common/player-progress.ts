import { PlayerState, GAMES } from './workspace';
import { validRowCompletion } from './story-template';
import { validCharacterCollection } from './characters';
export type ProgressSnapshot = { revision: number; state: Record<string, PlayerState> };
export function validPlayerState(value: unknown): value is PlayerState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const state = value as PlayerState;
    return (
        Object.keys(state).every((key) =>
            ['completed', 'quantity', 'target', 'storyRowCompletion', 'characterCollection'].includes(key),
        ) &&
        typeof state.completed === 'boolean' &&
        [state.quantity, state.target].every(
            (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e9,
        ) &&
        validRowCompletion(state.storyRowCompletion) &&
        (state.characterCollection === undefined || validCharacterCollection(state.characterCollection)) &&
        Object.keys(state.storyRowCompletion ?? {}).length <= 10000 &&
        Object.keys(state.storyRowCompletion ?? {}).every(safeId)
    );
}
export function safeId(id: string): boolean {
    return (
        id.length > 0 &&
        id.length <= 300 &&
        !/[.$\x00-\x1f]/.test(id) &&
        !['__proto__', 'constructor', 'prototype'].includes(id)
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
                validPlayerState(state)
            );
        })
    );
}
