import type { Entry } from './workspace.type';
import type { GameRegistration } from './games.type';

/** Derived read models only. No dashboard progress is persisted separately. */
export type DashboardProgress = { completed: number; total: number };
export type DashboardLink = DashboardProgress & { id: string; name: string; section?: string; fragment?: string };
export type DashboardPlan = { id: string; name: string; gameId: string; percent: number; feature: 'plans' | 'characters'; icon?: string; target?: string };
export type DashboardGame = {
    game: GameRegistration;
    progressUpdatedAt?: string;
    hasProgress?: boolean;
    version?: string;
    versionNumber?: string;
    story?: DashboardProgress & { resume?: DashboardLink; started?: boolean };
    achievements?: DashboardProgress;
    achievementCategories?: (DashboardProgress & { id: string; name: string })[];
    characters?: { owned: number; total: number; entries: { id: string; name: string; icon?: string; level?: number; hasGoal?: boolean; percent?: number }[] };
    plans?: DashboardPlan[];
    planCount?: number;
    inventory?: { total: number; sufficient: number; partial: number; missing: number; notRequired: number };
    farming?: { id: string; name: string; missing: number }[];
    materials?: { sufficient: number; partial: number; missing: number };
    materialIssues?: string[];
    activities?: DashboardLink[];
    patch?: DashboardLink;
    resources?: { title: string; url: string }[];
};
export type DashboardSummary = { games: DashboardGame[]; errors: { gameId: string; message: string }[]; generatedAt: string };
/** The calendar needs available event windows, not historical events or unrelated catalogs. */
export type DashboardEvents = { entries: Entry[]; errors: { gameId: string; message: string }[] };
