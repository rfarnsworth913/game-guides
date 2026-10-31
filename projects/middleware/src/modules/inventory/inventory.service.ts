import type { CatalogEntry, PlayerState } from '../../../../lib/types/workspace.type';
import { ApiError } from '../../core/errors/app-error';
export function validateInventoryProgress(entry: CatalogEntry, state: PlayerState): void {
    if (entry.kind === 'inventory' && (!Number.isSafeInteger(state.quantity) || state.quantity > (entry.maxStack ?? 1e9))) {
        throw new ApiError(400, 'Inventory quantities must be whole numbers within the item stack limit.');
    }
}
