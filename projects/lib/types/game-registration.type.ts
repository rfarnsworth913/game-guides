import type { GameConfiguration } from './game-overview.type';

/** Game configuration paired with its immutable identity for registry responses and editors. */
export type GameRegistration = GameConfiguration & { id: string };
export type { GameFeature, GameVisibility } from './game-overview.type';
