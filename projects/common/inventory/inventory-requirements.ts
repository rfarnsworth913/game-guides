import { Entry } from '../../lib/types/workspace.type';
import { characterCosts, hasCharacterGoal, farmingRequirements } from '../farming/farming';
import type {CharacterRules} from '../../lib/types/character.type';
import {progressionMaterialCosts} from '../characters/character-materials';
import {hasEquipmentGoal} from '../characters/character-equipment';

export function requirementStatus(owned: number, needed: number): 'not-required' | 'sufficient' | 'partial' | 'missing' {
    return needed <= 0 ? 'not-required' : owned >= needed ? 'sufficient' : owned > 0 ? 'partial' : 'missing';
}
export function inventoryRequirementIssues(entries: Entry[],game: string,rules?: CharacterRules): string[] {
    const selected=entries.filter(entry=>entry.game===game && entry.kind==='characters' && (hasCharacterGoal(entry.characterCollection) || hasEquipmentGoal(entry,entries))).map(entry=>entry.id);
    const result=farmingRequirements(entries,game,selected,'characters',false,rules);
    const issues=result.issues.map(issue=>issue.message);
    for(const item of entries.filter(entry=>entry.game===game && entry.kind==='inventory')) {
        for(const instance of item.equipmentInstances ?? []) {
            if(!instance.target){continue;}
            const tracks=item.equipmentDefinition?.progressionTracks ?? [];
            if(!tracks.length){issues.push(`${item.name}: upgrade rules unavailable.`);}
            else {issues.push(...progressionMaterialCosts(tracks,instance.current,instance.target).issues.map(issue=>`${item.name}: ${issue}`));}
        }
    }
    return [...new Set(issues)];
}

export type MaterialUsage = { id: string; name: string; quantity: number; characters: string[] };
export type InventoryItemView = {
    item: Entry;
    owned: number;
    required: number;
    missing: number;
    usages: MaterialUsage[];
};

/** Only explicit saved requirements are authoritative; character goals without recipes are excluded. */
export function inventoryItems(entries: Entry[], game: string, rules?: CharacterRules): InventoryItemView[] {
    const plans = entries.filter(
        (entry) => entry.game === game && entry.kind === 'plans' && !entry.completed,
    );
    const characters = new Map(
        entries
            .filter((entry) => entry.game === game && entry.kind === 'characters')
            .map((entry) => [entry.id, entry.name]),
    );
    const usageByItem = new Map<string, MaterialUsage[]>();
    for (const plan of plans) {
        const quantities = new Map<string, number>();
        plan.requirements.forEach((requirement) =>
            quantities.set(
                requirement.item,
                (quantities.get(requirement.item) ?? 0) + requirement.amount,
            ),
        );
        quantities.forEach((quantity, id) => {
            if (quantity > 0)
                {usageByItem.set(id, [
                    ...(usageByItem.get(id) ?? []),
                    {
                        id: plan.id,
                        name: plan.name,
                        quantity,
                        characters: plan.members
                            .map((member) => characters.get(member))
                            .filter((name): name is string => !!name),
                    },
                ]);}
        });
    }
    for (const character of entries.filter(entry => entry.game === game && entry.kind === 'characters' && (entry.characterCollection?.owned || entry.characterCollection?.target))) {
        const result = farmingRequirements(entries, game, [character.id], 'characters', false, rules);
        for (const material of result.materials) {
            usageByItem.set(material.item.id, [...(usageByItem.get(material.item.id) ?? []), { id: character.id, name: `${character.name} development`, quantity: material.required, characters: [character.name] }]);
        }
    }
    const equipped = new Set(entries.filter(entry => entry.game === game && entry.kind === 'characters').flatMap(entry => Object.values(entry.characterCollection?.gear ?? {}).flat()));
    for (const equipment of entries.filter(entry => entry.game === game && entry.kind === 'inventory' && entry.equipmentDefinition)) {
        for (const instance of equipment.equipmentInstances ?? []) {
            if (!instance.target || equipped.has(instance.id)) {continue;}
            const costs = progressionMaterialCosts(equipment.equipmentDefinition!.progressionTracks ?? [],instance.current,instance.target);
            costs.costs.forEach((quantity,id) => usageByItem.set(id,[...usageByItem.get(id) ?? [],{id:instance.id,name:`${equipment.name} upgrade`,quantity,characters:[]}]));
        }
    }
    return entries
        .filter((entry) => entry.game === game && entry.kind === 'inventory')
        .map((item) => {
            const usages = usageByItem.get(item.id) ?? [];
            const required = usages.reduce((total, usage) => total + usage.quantity, 0);
            return {
                item,
                owned: item.quantity,
                required,
                missing: Math.max(0, required - item.quantity),
                usages,
            };
        });
}

export function readyPlans(entries: Entry[], game: string): number {
    const items = new Map(
        entries
            .filter((entry) => entry.game === game && entry.kind === 'inventory')
            .map((entry) => [entry.id, entry.quantity]),
    );
    const materialPlans = entries.filter((entry) => {
        if (
            entry.game !== game ||
            entry.kind !== 'plans' ||
            entry.completed ||
            !entry.requirements.length
        )
            {return false;}
        const needs = new Map<string, number>();
        entry.requirements.forEach((requirement) =>
            needs.set(requirement.item, (needs.get(requirement.item) ?? 0) + requirement.amount),
        );
        return [...needs].every(([id, quantity]) => (items.get(id) ?? 0) >= quantity);
    }).length;
    const characterPlans = entries.filter(entry => {
        if (entry.game !== game || entry.kind !== 'characters' || !entry.characterCollection?.owned || !hasCharacterGoal(entry.characterCollection)) {return false;}
        const result = characterCosts(entry.characterDefinition, entry.characterCollection);
        return !result.issues.length && [...result.costs].every(([id, quantity]) => (items.get(id) ?? 0) >= quantity);
    }).length;
    return materialPlans + characterPlans;
}
