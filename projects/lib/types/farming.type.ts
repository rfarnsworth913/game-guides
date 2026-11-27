import type { Entry } from '@lib/types/workspace.type';
import type { FarmingSource } from '@lib/types/farming-config.type';

export type CostIssue = { characterId: string; message: string };
export type CharacterCost = { costs: Map<string, number>; issues: string[] };
export type FarmingMaterial = {
    item: Entry;
    required: number;
    owned: number;
    missing: number;
    characters: string[];
    plans: string[];
};
export type FarmingGroup = {
    id: string;
    source: FarmingSource | null;
    materials: FarmingMaterial[];
    characters: string[];
};
