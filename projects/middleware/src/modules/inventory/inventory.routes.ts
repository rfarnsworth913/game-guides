import type {IncomingMessage, ServerResponse} from 'node:http';
import type {ApiDependencies} from '../../app/app.types';
import {ApiError} from '../../core/errors/app-error';
import {jsonBody} from '../../core/http/request-body';
import {respond} from '../../core/http/response';
import {craftInventory} from '../../../../common/inventory/inventory-crafting';
import {inventoryItems} from '../../../../common/inventory/inventory-requirements';
import type {CraftRequest} from '../../../../lib/types/inventory.type';
import type {Entry, PlayerState} from '../../../../lib/types/workspace.type';
import {fromCatalog} from '../../../../common/workspace/workspace';
import {resolveCharacterReferences} from '../../../../common/characters/character-story';
import {resolveEventReferences} from '../../../../common/events/event-story';

export async function inventoryRoutes(request: IncomingMessage, response: ServerResponse, url: URL, dependencies: ApiDependencies): Promise<boolean> {
    const match = /^\/api\/me\/inventory\/([a-z][a-z0-9-]*)\/craft$/.exec(url.pathname);
    if (!match) {return false;}
    if (request.method !== 'POST') {throw new ApiError(405,'Method not allowed.');}
    const user = await dependencies.security.requireUser(request,true);
    if (!dependencies.progress) {throw new ApiError(503,'Account inventory unavailable.');}
    const body = await jsonBody(request);
    if (!body || typeof body !== 'object' || !('revision' in body) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0 || !('recipeId' in body) || typeof body.recipeId !== 'string' || !('quantity' in body) || !('chained' in body) || !('recipeChoices' in body) || Object.keys(body).some(key => !['revision','recipeId','quantity','chained','recipeChoices'].includes(key))) {throw new ApiError(400,'Invalid crafting request.');}
    const previous = await dependencies.progress.read(user.id);
    if (previous.revision !== body.revision) {throw new ApiError(409,'Inventory changed in another tab. Refresh inventory and review the recipe before retrying.');}
    const game = match[1], snapshot = await dependencies.repository.read(game);
    const config = snapshot.characterRules?.inventory;
    if (!config) {throw new ApiError(400,'No crafting recipes configured for this game.');}
    const entries: Entry[] = resolveEventReferences(resolveCharacterReferences(snapshot.entries)).map(entry => fromCatalog(entry,previous.state[`${game}/${entry.eventId ?? entry.id}`]));
    const reserved = new Map(inventoryItems(entries,game,snapshot.characterRules).map(view => [view.item.id,view.required]));
    try {
        const quantities = craftInventory(entries,game,config,body as unknown as CraftRequest,reserved);
        const changes: Record<string,PlayerState> = Object.fromEntries(Object.entries(quantities).map(([id,quantity]) => [`${game}/${id}`,{...(previous.state[`${game}/${id}`] ?? {completed:false,quantity:0,target:0}),quantity}]));
        respond(response,200,await dependencies.progress.patch(user.id,previous.revision,changes));
    } catch (error) {if (error instanceof ApiError) {throw error;} throw new ApiError(400,error instanceof Error ? error.message : 'Crafting failed.');}
    return true;
}
