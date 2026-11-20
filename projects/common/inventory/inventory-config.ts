import type {InventoryConfig, InventoryMetadata} from '../../lib/types/inventory.type';
import type {CatalogEntry} from '../../lib/types/workspace.type';
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160;
const id = (value: unknown): value is string => text(value) && /^[a-zA-Z0-9][\w-]*$/.test(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 100 && value.every(text);
const only = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const unique = (values: {id: string}[]) => new Set(values.map(value => value.id)).size === values.length;
const amount = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 1e9;
export function validInventoryMetadata(value: unknown): value is InventoryMetadata {
    return record(value) && only(value, ['aliases','tags','categoryIds','enabled']) && strings(value['aliases']) && strings(value['tags']) && strings(value['categoryIds']) && value['categoryIds'].every(id) && typeof value['enabled'] === 'boolean';
}
export function validInventoryConfig(value: unknown): value is InventoryConfig {
    if (!record(value) || !only(value,['categories','rarities','recipes'])) {return false;}
    const categories = value['categories'], recipes = value['recipes'], rarities = value['rarities'];
    if (!Array.isArray(categories) || categories.length > 100 || !categories.every((item: unknown) => record(item) && only(item,['id','label','icon','displayOrder','parentCategoryId','enabled']) && id(item['id']) && text(item['label']) && Number.isSafeInteger(item['displayOrder']) && typeof item['enabled'] === 'boolean' && (item['icon'] === globalThis.undefined || text(item['icon'])) && (item['parentCategoryId'] === globalThis.undefined || id(item['parentCategoryId']))) || !unique(categories as InventoryConfig['categories'])) {return false;}
    if (!Array.isArray(rarities) || rarities.length > 20 || !rarities.every((item: unknown) => record(item) && only(item,['rarity','color']) && amount(item['rarity']) && Number(item['rarity']) <= 20 && typeof item['color'] === 'string' && /^#[\da-fA-F]{6}$/.test(item['color'])) || new Set(rarities.map((item: {rarity: number}) => item.rarity)).size !== rarities.length) {return false;}
    const costs = (items: unknown) => Array.isArray(items) && items.length <= 50 && items.every((item: unknown) => record(item) && only(item,['itemId','quantity']) && id(item['itemId']) && amount(item['quantity']));
    if (!Array.isArray(recipes) || recipes.length > 1000 || !recipes.every((item: unknown) => record(item) && only(item,['id','outputItemId','outputQuantity','ingredients','currencyCosts','unlockContentIds','enabled']) && id(item['id']) && id(item['outputItemId']) && amount(item['outputQuantity']) && costs(item['ingredients']) && (item['ingredients'] as unknown[]).length > 0 && (item['currencyCosts'] === globalThis.undefined || costs(item['currencyCosts'])) && (item['unlockContentIds'] === globalThis.undefined || strings(item['unlockContentIds']) && item['unlockContentIds'].every(id)) && typeof item['enabled'] === 'boolean') || !unique(recipes as InventoryConfig['recipes'])) {return false;}
    const config = value as unknown as InventoryConfig;
    const acyclic = (edges: Map<string, string[]>) => {
        const done = new Set<string>(), active = new Set<string>();
        const visit = (key: string): boolean => {if (active.has(key)) {return false;} if (done.has(key)) {return true;} active.add(key); if (!(edges.get(key) ?? []).every(visit)) {return false;} active.delete(key); done.add(key); return true;};
        return [...edges.keys()].every(visit);
    };
    const categoryIds = new Set(config.categories.map(category => category.id));
    return config.categories.every(category => !category.parentCategoryId || categoryIds.has(category.parentCategoryId)) &&
        acyclic(new Map(config.categories.map(category => [category.id, category.parentCategoryId ? [category.parentCategoryId] : []]))) &&
        acyclic(new Map(config.recipes.map(recipe => [recipe.outputItemId, config.recipes.filter(other => other.outputItemId === recipe.outputItemId).flatMap(other => [...other.ingredients,...other.currencyCosts ?? []].map(cost => cost.itemId))])));
}
export function inventoryReferenceIssues(config: InventoryConfig | undefined, entries: CatalogEntry[]): string[] {
    if (!config) {return [];}
    const ids = new Map(entries.map(entry => [entry.id,entry]));
    const categories = new Set(config.categories.map(category => category.id));
    const issues: string[] = [];
    for (const entry of entries) {if (entry.inventoryMetadata?.categoryIds.some(id => !categories.has(id))) {issues.push(`${entry.name}: category assignment is unavailable.`);}}
    for (const recipe of config.recipes) {
        if ([recipe.outputItemId,...recipe.ingredients.map(cost => cost.itemId),...recipe.currencyCosts?.map(cost => cost.itemId) ?? []].some(id => ids.get(id)?.kind !== 'inventory' || !!ids.get(id)?.equipmentDefinition)) {issues.push(`${recipe.id}: choose existing materials in this game.`);}
        if (recipe.unlockContentIds?.some(id => !ids.has(id) || !['story','events','achievements'].includes(ids.get(id)!.kind))) {issues.push(`${recipe.id}: choose existing quest, event or achievement unlocks.`);}
    }
    return issues;
}
