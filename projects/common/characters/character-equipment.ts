import type {EquipmentDefinition, EquipmentInstance, EquipmentStat} from '@lib/types/equipment.type';
import type {CatalogEntry, PlayerState, Entry} from '@lib/types/workspace.type';
import type {CharacterRules, CharacterDefinition} from '@lib/types/character.type';
import {characterKey, validCharacterCollection} from '@common/characters/characters';
import {validProgressionTracks, validProgressionGraph} from '@common/characters/character-extension';
import {characterProgressIssues,characterTrackValue} from '@common/characters/character-progression';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const only = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const text = (value: unknown, max = 160): value is string => typeof value === 'string' && !!value.trim() && value.length <= max;
const key = (value: unknown): value is string => typeof value === 'string' && characterKey(value);
const stat = (value: unknown): value is EquipmentStat => record(value) && only(value, ['name','value']) && text(value['name']) && text(value['value']);
export function hasEquipmentGoal(character:Pick<Entry,'game'|'characterCollection'>,entries:Entry[]):boolean {
    const equipped = new Set(Object.values(character.characterCollection?.gear ?? {}).flat());
    return entries.filter(item => item.game === character.game && item.kind === 'inventory').some(item => (item.equipmentInstances ?? []).some(instance => equipped.has(instance.id) && instance.target &&
        (item.equipmentDefinition?.progressionTracks ?? []).some(track => characterTrackValue(instance.target!,track) > characterTrackValue(instance.current,track))));
}
export function validEquipmentDefinition(value: unknown): value is EquipmentDefinition {
    return record(value) && only(value, ['typeId','weaponType','progressionTracks','stats','setId','setBonuses']) && key(value['typeId']) &&
        (value['weaponType'] === globalThis.undefined || text(value['weaponType'])) && (value['setId'] === globalThis.undefined || key(value['setId'])) &&
        (value['progressionTracks'] === globalThis.undefined || (validProgressionTracks(value['progressionTracks']) && validProgressionGraph(value['progressionTracks']))) &&
        (value['stats'] === globalThis.undefined || (Array.isArray(value['stats']) && value['stats'].length <= 30 && value['stats'].every(stat))) &&
        (value['setBonuses'] === globalThis.undefined || (Array.isArray(value['setBonuses']) && value['setBonuses'].length <= 20 && value['setBonuses'].every(bonus => record(bonus) && only(bonus,['pieces','description']) && Number.isSafeInteger(bonus['pieces']) && Number(bonus['pieces']) > 0 && Number(bonus['pieces']) <= 30 && text(bonus['description'],5000))));
}
export function validEquipmentInstances(value: unknown): value is EquipmentInstance[] {
    return Array.isArray(value) && value.length <= 1000 && value.every(instance => record(instance) && only(instance,['id','current','target','mainStat','substats']) && key(instance['id']) && record(instance['current']) &&
        only(instance['current'],['level','gear','progression','ascensionRank','skillLevels','trackValues','nodeStates']) && validCharacterCollection({...instance['current'],owned:true, ...(instance['target'] !== globalThis.undefined ? {target:instance['target']} : {})}) &&
        (instance['mainStat'] === globalThis.undefined || stat(instance['mainStat'])) && (instance['substats'] === globalThis.undefined || (Array.isArray(instance['substats']) && instance['substats'].length <= 20 && instance['substats'].every(stat)))) && new Set((value as EquipmentInstance[]).map(instance => instance.id)).size === value.length;
}
export function equipmentFits(slot: CharacterRules['equipmentSlots'][number], item: Pick<Entry,'equipmentDefinition'>, character?: CharacterDefinition): boolean {
    const equipment = item.equipmentDefinition;
    return !!equipment && (!slot.allowedTypes?.length || slot.allowedTypes.includes(equipment.typeId)) && (!equipment.weaponType || !character?.weaponType || equipment.weaponType === character.weaponType);
}
export function equipmentInstanceIssues(item:Pick<Entry,'game'|'equipmentDefinition'>,instance:EquipmentInstance):string[] {
    const tracks = item.equipmentDefinition?.progressionTracks ?? [];
    const rules:CharacterRules = {levelCap:1000,rarities:[],weaponTypes:[],damageTypes:[],roles:[],equipmentSlots:[],progressionTracks:[],progressionProfiles:[{id:'equipment',gameId:item.game,tracks}]};
    return characterProgressIssues({...instance.current,owned:true,...(instance.target ? {target:instance.target} : {})},rules,{weaponType:'',damageType:'',roles:[],skills:[],passiveSkills:[],guides:[],progressionProfileId:'equipment'}).map(issue => issue.message);
}
/** Validate the whole proposed account state so assignment and quantity updates remain atomic. */
export function equipmentAccountIssues(catalog: CatalogEntry[], state: Record<string, PlayerState>, rules?: CharacterRules): string[] {
    const issues: string[] = [], instances = new Map<string, CatalogEntry>();
    for (const item of catalog) {
        const progress = state[`${item.game}/${item.id}`];
        if (!progress?.equipmentInstances) {continue;}
        if (item.kind !== 'inventory' || !item.equipmentDefinition || progress.equipmentInstances.length > progress.quantity) {issues.push('Owned equipment copies exceed inventory quantity or have no shared definition.'); continue;}
        for (const instance of progress.equipmentInstances) {
            if (instances.has(instance.id)) {issues.push('Equipment instance identifiers must be unique within the game.');}
            instances.set(instance.id,item);
            if (equipmentInstanceIssues(item,instance).length) {issues.push(`${item.name}: equipment progression violates its configured tracks.`);}
        }
    }
    const assigned = new Set<string>();
    for (const character of catalog.filter(entry => entry.kind === 'characters')) {
        const collection = state[`${character.game}/${character.id}`]?.characterCollection;
        for (const [slotId, ids] of Object.entries(collection?.gear ?? {})) {
            const slot = rules?.equipmentSlots.find(slot => slot.id === slotId);
            for (const id of ids) {
                const item = instances.get(id);
                if (!item) {if(id.startsWith('equipment-')){issues.push(`${character.name}: the equipped inventory copy is missing.`);} continue;} // Preserve legacy free-text gear without inventing an inventory match.
                if (!slot || !equipmentFits(slot,item,character.characterDefinition)) {issues.push(`${character.name}: equipment is incompatible with this slot.`);}
                if (assigned.has(id)) {issues.push('An equipment copy cannot be assigned to more than one character or slot.');}
                assigned.add(id);
            }
        }
    }
    return issues;
}
