import type { PlayerState } from '@lib/types/workspace.type';
import { validProgressState } from '@common/player/player-progress';
import { mergeUpdates } from '../merge-updates';
import { progressDates, validProgressDates } from '@common/player/progress-activity';
import type { GameProgressDates } from '@lib/types/player-progress.type';

type State = Record<string, PlayerState>;
const KEY = 'gg-player-v1';

/** Device-owned progress. Invalid input is rejected before any stored data is replaced. */
export class GuestProgressStorage {
    read(): State {
        const raw = localStorage.getItem(KEY);
        if (!raw) {return {};}
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 ||
            !('state' in value) || !validProgressState(value.state, null)) {
            throw new Error('Invalid local player data. Your stored data has not been overwritten.');
        }
        return value.state;
    }
    merge(base: State, edited: State): State {
        return mergeUpdates(base, edited, this.read());
    }
    activity(): GameProgressDates {
        const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
        return value && typeof value === 'object' && 'gameUpdatedAt' in value && validProgressDates(value.gameUpdatedAt) ? value.gameUpdatedAt : {};
    }
    write(state: State): void {
        if (!validProgressState(state, null)) {throw new Error('Invalid local player data. Your stored data has not been overwritten.');}
        const gameUpdatedAt = progressDates(this.read(), state, this.activity());
        localStorage.setItem(KEY, JSON.stringify({ version: 1, state, gameUpdatedAt }));
    }
}
