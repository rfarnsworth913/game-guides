import type { MaterialCost, UpgradeRecipe, FarmingSource, FarmingServer, FarmingConfig } from '../../lib/types/farming-config.type';

const record = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
const only = (value: Record<string, unknown>, keys: string[]) =>
    Object.keys(value).every((key) => keys.includes(key));
const text = (value: unknown, max = 160): value is string =>
    typeof value === 'string' && value.length <= max;
const name = (value: unknown): value is string => text(value) && !!value.trim();
const id = (value: unknown): value is string =>
    text(value, 300) &&
    !!value &&
    !/[.$]/.test(value) &&
    !Array.from(value).some((character) => character.charCodeAt(0) < 32) &&
    !['__proto__', 'prototype', 'constructor'].includes(value);
const integer = (value: unknown, min: number, max: number): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
export function farmingUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return (
            value.length <= 2000 &&
            ['https:', 'http:'].includes(url.protocol) &&
            !url.username &&
            !url.password
        );
    } catch {
        return false;
    }
}
export function validRecipes(value: unknown): value is UpgradeRecipe[] {
    return (
        Array.isArray(value) &&
        value.length <= 10000 &&
        value.every((recipe: unknown) => {
            if (!record(recipe) || !only(recipe, ['kind', 'key', 'from', 'to', 'materials']))
                {return false;}
            const keyed = recipe['kind'] === 'skill' || recipe['kind'] === 'progression';
            return (
                ['level', 'ascension', 'skill', 'progression'].includes(String(recipe['kind'])) &&
                (keyed ? id(recipe['key']) : typeof recipe['key'] === 'undefined') &&
                integer(
                    recipe['from'],
                    recipe['kind'] === 'ascension' || recipe['kind'] === 'progression' ? 0 : 1,
                    999,
                ) &&
                recipe['to'] === recipe['from'] + 1 &&
                Array.isArray(recipe['materials']) &&
                recipe['materials'].length <= 100 &&
                recipe['materials'].every(
                    (cost: unknown) =>
                        record(cost) &&
                        only(cost, ['item', 'amount']) &&
                        id(cost['item']) &&
                        integer(cost['amount'], 1, 1e9),
                ) &&
                new Set(recipe['materials'].map((cost: MaterialCost) => cost.item)).size ===
                    recipe['materials'].length
            );
        }) &&
        new Set(
            value.map(
                (recipe: UpgradeRecipe) => `${recipe.kind}:${recipe.key ?? ''}:${recipe.from}`,
            ),
        ).size === value.length
    );
}
export function validFarmingConfig(value: unknown): value is FarmingConfig {
    if (
        !record(value) ||
        !only(value, ['sources', 'servers']) ||
        !Array.isArray(value['sources']) ||
        !Array.isArray(value['servers'])
    )
        {return false;}
    return (
        value['sources'].length <= 500 &&
        value['sources'].every(
            (source: unknown) =>
                record(source) &&
                only(source, [
                    'id',
                    'name',
                    'category',
                    'region',
                    'location',
                    'materialIds',
                    'days',
                    'url',
                    'restrictions',
                ]) &&
                id(source['id']) &&
                source['id'] !== '@unknown' &&
                name(source['name']) &&
                name(source['category']) &&
                text(source['region']) &&
                text(source['location']) &&
                text(source['restrictions'], 2000) &&
                text(source['url'], 2000) &&
                (!source['url'] || farmingUrl(source['url'])) &&
                Array.isArray(source['materialIds']) &&
                source['materialIds'].length > 0 &&
                source['materialIds'].length <= 500 &&
                source['materialIds'].every(id) &&
                new Set(source['materialIds']).size === source['materialIds'].length &&
                (typeof source['days'] === 'undefined' ||
                    (Array.isArray(source['days']) &&
                        source['days'].length > 0 &&
                        source['days'].every((day) => integer(day, 0, 6)) &&
                        new Set(source['days']).size === source['days'].length)),
        ) &&
        new Set(value['sources'].map((source: FarmingSource) => source.id)).size ===
            value['sources'].length &&
        value['servers'].length <= 20 &&
        value['servers'].every((server: unknown) => {
            if (
                !record(server) ||
                !only(server, ['id', 'name', 'timeZone', 'resetHour', 'resetMinute']) ||
                !id(server['id']) ||
                !name(server['name']) ||
                !name(server['timeZone']) ||
                !integer(server['resetHour'], 0, 23) ||
                !integer(server['resetMinute'], 0, 59)
            )
                {return false;}
            try {
                new Intl.DateTimeFormat('en', { timeZone: server['timeZone'] });
                return true;
            } catch {
                return false;
            }
        }) &&
        new Set(value['servers'].map((server: FarmingServer) => server.id)).size ===
            value['servers'].length
    );
}
