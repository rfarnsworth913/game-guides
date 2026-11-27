import type { PlayerState } from '@lib/types/workspace.type';

/** Last actual progress change per game; account timestamps are assigned by the server. */
export type GameProgressDates = Record<string, string>;
export type ProgressSnapshot = { revision: number; state: Record<string, PlayerState>; gameUpdatedAt?: GameProgressDates };
