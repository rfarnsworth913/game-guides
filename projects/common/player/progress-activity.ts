import type { PlayerState } from '@lib/types/workspace.type';
import type { GameProgressDates } from '@lib/types/player-progress.type';
import { validGameId } from '@common/workspace/game-overview';

/** Exclude untouched/default projections when older accounts first save their workspace. */
export function hasProgress(state: PlayerState): boolean {
    const character = state.characterCollection;
    return state.completed || state.quantity > 0 || Object.values(state.storyRowCompletion ?? {}).some(Boolean) ||
        !!state.teams?.length || !!state.equipmentInstances?.length || !!character && (character.owned || !!character.target || character.level > 1);
}
export function validProgressDates(value: unknown): value is GameProgressDates {
    return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length <= 1000 &&
        Object.entries(value).every(([game, date]) => validGameId(game) && typeof date === 'string' && Number.isFinite(Date.parse(date)));
}
export function progressDates(previous: Record<string, PlayerState>, next: Record<string, PlayerState>, dates: GameProgressDates = {}, now = Date.now()): GameProgressDates {
    const result = { ...dates };
    const timestamp = new Date(Math.max(now, ...Object.values(dates).map(date => Date.parse(date) + 1).filter(Number.isFinite))).toISOString();
    for (const [key, state] of Object.entries(next)) {
        if (JSON.stringify(previous[key]) === JSON.stringify(state) || (!previous[key] && !hasProgress(state))) {continue;}
        result[key.slice(0, key.indexOf('/'))] = timestamp;
    }
    return result;
}
