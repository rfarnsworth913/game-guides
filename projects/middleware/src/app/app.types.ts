import type { GameRepository } from '../modules/games/games.repository';
import type { ProgressRepository } from '../modules/progress/progress.repository';
import type { Security } from '../core/auth/auth.types';

export type CatalogRepository = Pick<GameRepository, 'read' | 'write' | 'parsed'>;
export type AccountProgressRepository = Pick<ProgressRepository, 'read' | 'patch'>;
export type ApiDependencies = {
    repository: CatalogRepository;
    progress?: AccountProgressRepository;
    security: Security;
    ping: () => Promise<unknown>;
    assetsRoot: string;
};
