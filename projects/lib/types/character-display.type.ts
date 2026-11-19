import type { Entry } from './workspace.type';
export type CharacterCardViewModel = {
    entry: Entry; characterId: string; gameId: string; name: string; headshotUrl: string | null;
    rarity: number; rarityLabel: string; attributes: { id: string; label: string; value: string }[];
    attributeValues: Record<string, string[]>; searchText: string;
    owned: boolean; planned: boolean; favorite: boolean; hasGoal: boolean; unfinished: boolean;
    currentLevel?: number; targetLevel?: number; maximumLevel?: number; progressionPercent?: number;
};
