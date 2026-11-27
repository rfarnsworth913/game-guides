import type { Entry } from '@lib/types/workspace.type';
import type { CharacterRules } from '@lib/types/character.type';
import type { CharacterCardViewModel } from '@lib/types/character-display.type';
import { characterProfileTracks, characterTrackValue, characterTrackProgress } from '@common/characters/character-progression';
import { trackMaximum, trackMinimum, characterHeadshotUrl } from '@common/characters/character-extension';
import {hasEquipmentGoal} from '@common/characters/character-equipment';

export function characterCard(entry: Entry, rules?: CharacterRules, inventory:Entry[] = []): CharacterCardViewModel {
    const definition = entry.characterDefinition, collection = entry.characterCollection;
    const values = { damageType: definition?.damageType || entry.characterInformation?.damageType || '', weaponType: definition?.weaponType ?? '', roles: definition?.roles ?? [], ...definition?.attributes };
    const attributeValues = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, (Array.isArray(value) ? value : [String(value)]).filter(value => !!value.trim())]));
    const registry = rules?.attributes?.slice().sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id));
    const headers = registry?.length ? registry.filter(attribute => attribute.visibleInHeader).map(attribute => ({ id: attribute.id, label: attribute.label })) : [{ id: 'damageType', label: 'Damage type' }, { id: 'weaponType', label: 'Weapon' }];
    const attributes = headers.flatMap(attribute => attributeValues[attribute.id]?.length ? [{ ...attribute, value: attributeValues[attribute.id].join(', ') }] : []).slice(0, 2);
    const level = rules ? characterProfileTracks(rules, definition).find(track => track.type === 'level' || track.storage?.field === 'level') : null;
    const maximumLevel = level ? trackMaximum(level) : rules?.levelCap;
    const currentLevel = collection ? level ? characterTrackValue(collection, level) : collection.level : globalThis.undefined;
    const targetLevel = collection?.target ? level ? characterTrackValue({ ...collection, ...collection.target, trackValues: { ...collection.trackValues, ...collection.target.trackValues } }, level) : collection.target.level : globalThis.undefined;
    const minimum = level ? trackMinimum(level) : 1;
    const target = collection?.target;
    const equipmentGoal = hasEquipmentGoal(entry,inventory);
    const unfinished = equipmentGoal || !!collection && !!target && (target.level > collection.level || (target.ascensionRank ?? 0) > (collection.ascensionRank ?? 0) ||
        Object.entries(target.skillLevels ?? {}).some(([key, value]) => value > (collection.skillLevels?.[key] ?? 1)) ||
        Object.entries(target.progression).some(([key, value]) => value > (collection.progression[key] ?? 0)) ||
        Object.entries(target.gear).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(collection.gear[key] ?? [])) ||
        (!!rules && characterTrackProgress(collection, rules, definition).some(track => !track.reached)));
    let progressionPercent: number | undefined;
    if (collection?.owned && currentLevel !== globalThis.undefined && targetLevel !== globalThis.undefined && maximumLevel !== globalThis.undefined && targetLevel <= maximumLevel) {
        progressionPercent = targetLevel <= minimum ? currentLevel >= targetLevel ? 100 : 0 : Math.max(0, Math.min(100, (currentLevel - minimum) / (targetLevel - minimum) * 100));
    }
    // Older story migrations sometimes placed full artwork in icon; never use it as a headshot fallback.
    const icon = entry.icon && entry.icon !== entry.characterInformation?.imageUrl && !/(?:splash|full[-_ ]?(?:art|body))/i.test(entry.icon) ? entry.icon : null;
    const image = definition?.headshot || icon;
    return { entry, characterId: entry.id, gameId: entry.game, name: entry.name, rarity: entry.rarity, rarityLabel: rules?.rarityLabels?.[String(entry.rarity)] ?? (entry.rarity ? `${entry.rarity} ★` : 'Rarity not set'),
        headshotUrl: image && characterHeadshotUrl(image) ? image : null, attributes, attributeValues,
        searchText: [entry.name, ...(definition?.alternateNames ?? []), ...Object.entries(attributeValues).filter(([id]) => registry?.find(attribute => attribute.id === id)?.searchable !== false).flatMap(([, values]) => values)].join(' ').toLocaleLowerCase(),
        owned: collection?.owned ?? false, planned: !collection?.owned && !!collection?.target, favorite: collection?.favorite ?? false, hasGoal: !!target || equipmentGoal, unfinished,
        currentLevel, targetLevel, maximumLevel, progressionPercent };
}
