export type GameLibraryView = 'all' | 'favorites' | 'pinned' | 'recent' | 'collection' | 'manage';
export type GameLibrarySort = 'name-asc' | 'name-desc' | 'recently-used' | 'recently-added' | 'game-type' | 'custom';
export type GameLibraryPreferences = {
    viewMode: 'grid' | 'list'; sortBy: GameLibrarySort;
    collapsedSections: { pinnedGames: boolean; recentlyUsed: boolean; collections: boolean };
};
export type UserGamePreference = { gameId: string; isFavorite: boolean; isPinned: boolean; lastAccessedAt?: string; lastVisitedFeatureId?: string };
export type UserGameCollection = { id: string; label: string; icon: string; gameIds: string[]; createdAt: string; updatedAt: string };
/** Ordered arrays preserve manual pin/collection ordering. Never embedded in shared games. */
export type UserGameLibrary = { revision: number; games: UserGamePreference[]; pinnedOrder: string[]; collections: UserGameCollection[]; preferences: GameLibraryPreferences };
