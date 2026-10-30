import { Entry } from './workspace.store';

export type MaterialUsage = { id: string; name: string; quantity: number; characters: string[] };
export type InventoryItemView = {
    item: Entry;
    owned: number;
    required: number;
    missing: number;
    usages: MaterialUsage[];
};

/** Only explicit saved requirements are authoritative; character goals without recipes are excluded. */
export function inventoryItems(entries: Entry[], game: string): InventoryItemView[] {
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
    return entries.filter((entry) => {
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
}
