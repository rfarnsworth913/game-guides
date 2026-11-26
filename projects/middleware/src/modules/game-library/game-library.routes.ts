import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiDependencies } from '../../app/app.types';
import { ApiError } from '../../core/errors/app-error';
import { respond } from '../../core/http/response';
import { jsonBody } from '../../core/http/request-body';
import { validGameLibrary } from '@common/workspace/game-library';
export async function gameLibraryRoutes(request:IncomingMessage,response:ServerResponse,url:URL,dependencies:ApiDependencies):Promise<boolean> {
    if(url.pathname!=='/api/me/game-library') {return false;}
    if(!['GET','PUT'].includes(request.method??'')) {throw new ApiError(405,'Method not allowed.');}
    const user=await dependencies.security.requireUser(request,request.method==='PUT');
    if(!dependencies.library) {throw new ApiError(503,'Personal game library is unavailable.');}
    if(request.method==='GET') {
        const library=await dependencies.library.read(user.id),games=await dependencies.repository.list?.();
        if(!games) {throw new ApiError(503,'Game registry unavailable.');}
        const ids=new Set(games.map(game=>game.gameId));
        respond(response,200,{...library,games:library.games.filter(game=>ids.has(game.gameId)),pinnedOrder:library.pinnedOrder.filter(id=>ids.has(id)),collections:library.collections.map(item=>({...item,gameIds:item.gameIds.filter(id=>ids.has(id))}))});return true;
    }
    const body=await jsonBody(request);
    if(!validGameLibrary(body)) {throw new ApiError(400,'Invalid game library preferences.');}
    const games=await dependencies.repository.list?.();
    if(!games) {throw new ApiError(503,'Game registry is unavailable.');}
    const ids=new Set(games.map(game=>game.gameId));
    if(body.games.some(game=>!ids.has(game.gameId)) || body.collections.some(collection=>collection.gameIds.some(id=>!ids.has(id)))) {throw new ApiError(400,'Library references an unknown game.');}
    respond(response,200,await dependencies.library.save(user.id,body));return true;
}
