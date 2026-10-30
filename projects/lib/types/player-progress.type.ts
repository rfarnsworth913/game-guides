import type { PlayerState } from './workspace.type';

export type ProgressSnapshot = { revision: number; state: Record<string, PlayerState> };
