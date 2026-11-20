export type InventoryCategory = { id: string; label: string; icon?: string; displayOrder: number; parentCategoryId?: string; enabled: boolean };
export type InventoryRecipe = { id: string; outputItemId: string; outputQuantity: number; ingredients: { itemId: string; quantity: number }[]; currencyCosts?: { itemId: string; quantity: number }[]; unlockContentIds?: string[]; enabled: boolean };
export type InventoryConfig = { categories: InventoryCategory[]; rarities: { rarity: number; color: string }[]; recipes: InventoryRecipe[] };
export type InventoryMetadata = { aliases: string[]; tags: string[]; categoryIds: string[]; enabled: boolean };
export type CraftRequest = { recipeId: string; quantity: number; chained: boolean; recipeChoices: Record<string, string> };
