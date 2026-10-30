
export type MaterialCost = { item: string; amount: number };
export type UpgradeRecipe = {
    kind: 'level' | 'ascension' | 'skill' | 'progression';
    key?: string;
    from: number;
    to: number;
    materials: MaterialCost[];
};
export type FarmingSource = {
    id: string;
    name: string;
    category: string;
    region: string;
    location: string;
    materialIds: string[];
    days?: number[];
    url: string;
    restrictions: string;
};
export type FarmingServer = {
    id: string;
    name: string;
    timeZone: string;
    resetHour: number;
    resetMinute: number;
};
export type FarmingConfig = { sources: FarmingSource[]; servers: FarmingServer[] };
