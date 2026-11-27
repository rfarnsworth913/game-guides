import type { UserGameLibrary, GameRegistration, UserGamePreference, UserGameCollection } from '@lib/types';
import { validGameId, canAccessFeature, canAccessGame } from './game-overview';
export function emptyGameLibrary(): UserGameLibrary {
    return { revision: 0, games: [], pinnedOrder: [], collections: [], preferences: {viewMode:'grid',sortBy:'name-asc',collapsedSections:{pinnedGames:false,recentlyUsed:false,collections:false}} };
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const unique = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 5000 && value.every(validGameId) && new Set(value).size === value.length;
const date = (value: unknown) => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
function preference(value:unknown):value is UserGamePreference {
    return record(value) && validGameId(value['gameId']) && typeof value['isFavorite']==='boolean' && typeof value['isPinned']==='boolean' &&
        (value['lastAccessedAt']===globalThis.undefined || date(value['lastAccessedAt'])) &&
        (value['lastVisitedFeatureId']===globalThis.undefined || typeof value['lastVisitedFeatureId']==='string' && ['dashboard','story','characters','teams','inventory','plans','events','farming','achievements'].includes(value['lastVisitedFeatureId'])) &&
        Object.keys(value).every(key=>['gameId','isFavorite','isPinned','lastAccessedAt','lastVisitedFeatureId'].includes(key));
}
function collection(value:unknown):value is UserGameCollection {
    return record(value) && validGameId(value['id']) && typeof value['label']==='string' && !!value['label'].trim() && value['label'].length<=80 &&
        typeof value['icon']==='string' && value['icon'].length<=2048 && !/[<>]/.test(value['icon']) && (!value['icon'].includes('/') || /^(https?:\/\/|\/api\/games\/)/.test(value['icon'])) &&
        unique(value['gameIds']) && date(value['createdAt']) && date(value['updatedAt']) && Object.keys(value).every(key=>['id','label','icon','gameIds','createdAt','updatedAt'].includes(key));
}
export function validGameLibrary(value: unknown): value is UserGameLibrary {
    if (!record(value) || !Number.isSafeInteger(value['revision']) || Number(value['revision']) < 0 || Number(value['revision']) >= Number.MAX_SAFE_INTEGER ||
        Object.keys(value).some(key => !['revision','games','pinnedOrder','collections','preferences'].includes(key))) {return false;}
    const rawGames:unknown=value['games'],rawCollections:unknown=value['collections'],prefs=value['preferences'];
    if(!Array.isArray(rawGames)||rawGames.length>5000||!rawGames.every(preference)) {return false;}
    const games=rawGames as UserGamePreference[];
    if(new Set(games.map(game=>game.gameId)).size!==games.length) {return false;}
    if (!unique(value['pinnedOrder']) || value['pinnedOrder'].length!==games.filter(game=>game.isPinned).length || value['pinnedOrder'].some(id=>!games.some(game=>game.gameId===id && game.isPinned))) {return false;}
    if(!Array.isArray(rawCollections)||rawCollections.length>200||!rawCollections.every(collection)) {return false;}
    const collections=rawCollections as UserGameCollection[];
    if(new Set(collections.map(item=>item.id)).size!==collections.length) {return false;}
    return record(prefs) && Object.keys(prefs).every(key=>['viewMode','sortBy','collapsedSections'].includes(key)) && typeof prefs['viewMode']==='string' && ['grid','list'].includes(prefs['viewMode']) &&
        typeof prefs['sortBy']==='string' && ['name-asc','name-desc','recently-used','recently-added','game-type','custom'].includes(prefs['sortBy']) && record(prefs['collapsedSections']) &&
        Object.keys(prefs['collapsedSections']).length===3 && ['pinnedGames','recentlyUsed','collections'].every(key=>typeof (prefs['collapsedSections'] as Record<string,unknown>)[key]==='boolean');
}
export function gameDestination(game: GameRegistration, current: string | undefined, library: UserGameLibrary, editor: boolean): string {
    const previous=library.games.find(item=>item.gameId===game.gameId)?.lastVisitedFeatureId;
    const feature=[current,previous,'dashboard'].find(feature=>!!feature && canAccessFeature(game,feature,editor)) ?? 'dashboard';
    return `/games/${game.gameId}/${feature}`;
}
export function searchGames(games: GameRegistration[], query: string, library: UserGameLibrary, editor: boolean): GameRegistration[] {
    const term=query.trim().toLocaleLowerCase();
    const normalize=(value:string)=>value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
    const fuzzy=(value:string)=>{let i=0;for(const char of normalize(value)) {if(char===normalize(term)[i]) {i++;}} return i===normalize(term).length;};
    const rank=(game:GameRegistration)=>{
        const title=game.name.toLocaleLowerCase(), abbreviation=game.short.toLocaleLowerCase();
        if(!term) {return 0;} if(title===term) {return 0;} if(abbreviation===term) {return 1;} if(title.startsWith(term)) {return 2;}
        if([title,abbreviation].some(text=>text.includes(term))) {return 3;} if(term.length>1 && [title,abbreviation].some(fuzzy)) {return 4;}
        if(game.genres.some(text=>text.toLocaleLowerCase().includes(term))) {return 5;} return 99;
    };
    const recent=(id:string)=>Date.parse(library.games.find(item=>item.gameId===id)?.lastAccessedAt??'')||0;
    return games.filter(game=>canAccessGame(game,editor) && rank(game)<99).sort((a,b)=>rank(a)-rank(b) || Number(library.pinnedOrder.includes(b.gameId))-Number(library.pinnedOrder.includes(a.gameId)) || recent(b.gameId)-recent(a.gameId) || a.name.localeCompare(b.name));
}
