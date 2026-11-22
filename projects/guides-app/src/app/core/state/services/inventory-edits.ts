import type { Entry } from '@lib/types/workspace.type';

export function inventoryQuantityEdits(entries: Entry[], game: string, changes: Record<string, number>): Entry[] {
    const updates = Object.entries(changes);
    if (!updates.length || !updates.every(([id, quantity]) => {
        const item = entries.find(entry => entry.game === game && entry.id === id && entry.kind === 'inventory');
        return !!item && Number.isSafeInteger(quantity) && quantity >= 0 && quantity <= (item.maxStack ?? 1e9);
    })) {throw new Error("Enter whole quantities between zero and each item's stack limit.");}
    return entries.map(entry => entry.game === game && entry.kind === 'inventory' && Object.hasOwn(changes, entry.id) ? { ...entry, quantity: changes[entry.id] } : entry);
}
