import type {Entry} from '@lib/types/workspace.type';
import type {InventoryConfig, CraftRequest, InventoryRecipe} from '@lib/types/inventory.type';
import {validInventoryConfig} from '@common/inventory/inventory-config';

export function craftInventory(entries: Entry[], game: string, config: InventoryConfig, request: CraftRequest, reserved: Map<string, number> = new Map()): Record<string, number> {
    if (!validInventoryConfig(config) || !Number.isSafeInteger(request.quantity) || request.quantity < 1 || request.quantity > 1e9 || typeof request.chained !== 'boolean' || !request.recipeChoices || typeof request.recipeChoices !== 'object' || Array.isArray(request.recipeChoices) || Object.keys(request.recipeChoices).length > 1000 || Object.values(request.recipeChoices).some(value => typeof value !== 'string')) {throw new Error('Invalid recipe configuration or crafting quantity.');}
    const items = new Map(entries.filter(entry => entry.game === game && entry.kind === 'inventory').map(entry => [entry.id, entry]));
    const original = new Map([...items].map(([id, entry]) => [id, entry.quantity]));
    const quantities = new Map(original);
    const unlocked = (recipe: InventoryRecipe) => recipe.enabled && (recipe.unlockContentIds ?? []).every(id => entries.some(entry => entry.game === game && entry.id === id && entry.completed));
    const requiredItem = (id: string) => {const item = items.get(id); if (!item || item.inventoryMetadata?.enabled === false || item.equipmentDefinition) {throw new Error(`Material ${id} is unavailable for crafting.`);} return item;};
    let operations = 0;
    const run = (recipe: InventoryRecipe, batches: number, active = new Set<string>()) => {
        if (++operations > 2000 || active.has(recipe.outputItemId)) {throw new Error('Crafting dependency limit or circular recipe reached.');}
        if (!unlocked(recipe)) {throw new Error('This recipe is disabled or its unlock requirements are not complete.');}
        const output = requiredItem(recipe.outputItemId);
        const path = new Set([...active, recipe.outputItemId]);
        const costs = new Map<string, number>();
        for (const cost of [...recipe.ingredients, ...recipe.currencyCosts ?? []]) {costs.set(cost.itemId, (costs.get(cost.itemId) ?? 0) + cost.quantity * batches);}
        for (const [id, quantity] of costs) {
            const item = requiredItem(id), needed = quantity + (reserved.get(id) ?? 0);
            if (!Number.isSafeInteger(needed)) {throw new Error('Crafting quantity is too large.');}
            const deficit = needed - (quantities.get(id) ?? 0);
            if (deficit > 0 && request.chained) {
                const alternatives = config.recipes.filter(value => value.outputItemId === id && unlocked(value));
                const choice = request.recipeChoices[id];
                const selected = choice ? alternatives.find(value => value.id === choice) : alternatives.length === 1 ? alternatives[0] : null;
                if (!selected) {throw new Error(`Choose an available conversion recipe for ${item.name}, or acquire more ingredients.`);}
                run(selected, Math.ceil(deficit / selected.outputQuantity), path);
            }
            if ((quantities.get(id) ?? 0) < needed) {throw new Error(`Not enough ${item.name} after reserving materials for active plans.`);}
            quantities.set(id, quantities.get(id)! - quantity);
        }
        const next = quantities.get(output.id)! + batches * recipe.outputQuantity;
        if (!Number.isSafeInteger(next) || next > (output.maxStack ?? 1e9)) {throw new Error(`${output.name} exceeds its stack limit.`);}
        quantities.set(output.id, next);
    };
    const recipe = config.recipes.find(recipe => recipe.id === request.recipeId);
    if (!recipe) {throw new Error('Crafting recipe not found.');}
    run(recipe, request.quantity);
    return Object.fromEntries([...quantities].filter(([id, quantity]) => original.get(id) !== quantity));
}

export function craftableBatches(entries: Entry[], game: string, config: InventoryConfig, request: CraftRequest, reserved: Map<string, number>): number {
    let low = 0, high = 1e9;
    while (low < high) {const middle = Math.ceil((low + high) / 2); try {craftInventory(entries, game, config, {...request, quantity: middle}, reserved); low = middle;} catch {high = middle - 1;}}
    return low;
}
