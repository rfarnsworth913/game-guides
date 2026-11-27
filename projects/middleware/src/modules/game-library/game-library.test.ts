import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Collection } from 'mongodb';
import { emptyGameLibrary, validGameLibrary, searchGames, gameDestination } from '@common/workspace/game-library';
import { defaultGameOverview } from '@common/workspace/game-overview';
import { GameLibraryRepository, type LibraryDocument } from './game-library.repository';
import { createApi } from '../../app/server';
import { ApiError } from '../../core/errors/app-error';
import { editorFixture } from '../../tests/helpers/test-support';
function repository() {
 const documents=new Map<string,LibraryDocument>();
 const collection={findOne:async({_id}:{_id:string})=>documents.get(_id)??null,
 insertOne:async(doc:LibraryDocument)=>{if(documents.has(doc._id)) {throw Object.assign(new Error('duplicate'),{code:11000});}documents.set(doc._id,structuredClone(doc));},
 updateOne:async({_id,revision}:{_id:string;revision:number},update:{$set:LibraryDocument})=>{const current=documents.get(_id);if(current?.revision!==revision) {return {matchedCount:0};}documents.set(_id,{...current,...structuredClone(update.$set)});return {matchedCount:1};}} as unknown as Collection<LibraryDocument>;
 return new GameLibraryRepository(collection);
}
await test('library validation rejects duplicate membership, forged ownership, invalid identifiers and pin orders',()=>{
 const library=emptyGameLibrary();assert.ok(validGameLibrary(library));
 const collection={id:'collection-one',label:'Playing',icon:'▦',gameIds:['genshin'],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 assert.ok(validGameLibrary({...library,collections:[collection]}));
 for(const bad of [{...library,userId:'victim'},{...library,pinnedOrder:['genshin']},{...library,collections:[{...collection,gameIds:['genshin','genshin']}]},{...library,collections:[{...collection,icon:['javascript','alert(1)/'].join(':')}]},{...library,games:[{gameId:'constructor',isPinned:false,isFavorite:false}]}]) {assert.equal(validGameLibrary(bad),false);}
});
await test('library writes isolate accounts and reject stale and racing initial saves',async()=>{
 const store=repository(),library=emptyGameLibrary();library.games=[{gameId:'genshin',isFavorite:true,isPinned:false}];
 const saved=await store.save('alice',library);assert.equal(saved.revision,1);assert.equal((await store.read('bob')).games.length,0);
 await assert.rejects(store.save('alice',library),{status:409});
 const racers=await Promise.allSettled([store.save('alice',saved),store.save('alice',saved)]);assert.equal(racers.filter(result=>result.status==='fulfilled').length,1);
});
await test('library API authenticates owners, validates references, and never writes shared catalog data',async t=>{
 const games=['genshin','hsr'].map(defaultGameOverview),library=repository();
 const security={...editorFixture,async requireUser(request:import('node:http').IncomingMessage){const id=request.headers['x-user'];if(typeof id!=='string') {throw new ApiError(401,'Sign in required.');}return {id,name:id,editor:false,csrf:'fixture'};}};
 const server=createApi({read:async(id:string)=>({id,name:id,revision:0,entries:[]}),list:async()=>games,write:async()=>{throw new Error('Shared writes forbidden.');},parsed:async()=>({})},['http://localhost:4200'],async()=>true,globalThis.undefined,security,globalThis.undefined,library);
 await new Promise<void>(resolve=>{server.listen(0,'127.0.0.1',resolve);});t.after(()=>new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();}));
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 const request=(user?:string,body?:unknown)=>fetch(base+'/api/me/game-library',{method:body?'PUT':'GET',headers:{...(user?{'x-user':user}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await request()).status,401);const state=emptyGameLibrary();state.games=[{gameId:'genshin',isFavorite:true,isPinned:false}];
 assert.equal((await request('alice',state)).status,200);assert.deepEqual(((await (await request('bob')).json()) as {games:unknown[]}).games,[]);
 assert.equal((await request('alice',state)).status,409);assert.equal((await request('bob',{...state,games:[{gameId:'unknown',isPinned:false,isFavorite:true}]})).status,400);
 assert.equal((await request('bob',{...state,_id:'alice'})).status,400);
 const metadata=await fetch(base+'/api/games/library');assert.equal(metadata.status,200);assert.equal(((await metadata.json()) as {games:{content?:unknown}[]}).games[0].content,globalThis.undefined);
});
await test('search ranks titles, genres, abbreviations and fuzzy matches while respecting access and feature fallbacks',()=>{
 const genshin={...defaultGameOverview('genshin'),genres:['Action RPG','Open World']},hsr=defaultGameOverview('hsr'),privateGame={...defaultGameOverview('secret'),visibility:'editors' as const};
 const library=emptyGameLibrary();assert.equal(searchGames([hsr,genshin,privateGame],'open world',library,false)[0].gameId,'genshin');assert.equal(searchGames([genshin,hsr],'hsr',library,false)[0].gameId,'hsr');assert.equal(searchGames([genshin,hsr],'gnshn',library,false)[0].gameId,'genshin');assert.equal(searchGames([privateGame],'secret',library,false).length,0);
 hsr.features={events:{feature:'events',visibility:'public'}};library.games=[{gameId:'hsr',isFavorite:false,isPinned:false,lastVisitedFeatureId:'events'}];assert.equal(gameDestination(hsr,'story',library,false),'/games/hsr/events');
});
