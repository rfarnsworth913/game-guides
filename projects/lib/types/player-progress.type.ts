import type { PlayerState } from '@lib/types/workspace.type';

export type ProgressSnapshot = { revision: number; state: Record<string, PlayerState> };
