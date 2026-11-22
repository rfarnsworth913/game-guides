import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {AddressInfo} from 'node:net';
import type {Entry, PlayerState} from '@lib/types/workspace.type';
import type {InventoryConfig, CraftRequest} from '@lib/types/inventory.type';
import type {CharacterRules} from '@lib/types/character.type';
import {validInventoryConfig} from '@common/inventory/inventory-config';
import {craftInventory,craftableBatches} from '@common/inventory/inventory-crafting';
import {inventoryItems,requirementStatus} from '@common/inventory/inventory-requirements';
import {emptyCharacterCollection,emptyCharacterDefinition} from '@common/characters/characters';
import {toCatalog} from '@common/workspace/workspace';
import {createApi} from '../../app/server';
import {editorFixture} from '../../tests/helpers/test-support';
import {ApiError} from '../../core/errors/app-error';
import type {CatalogRepository,AccountProgressRepository} from '../../app/app.types';

const item = (id:string,quantity:number,game='genshin'):Entry => ({id,game,name:id,quantity,kind:'inventory',completed:false,target:0,category:'Materials',rarity:1,order:0,day:'',notes:'',members:[],requirements:[]});
const config:InventoryConfig = {categories:[{id:'materials',label:'Materials',displayOrder:0,enabled:true}],rarities:[{rarity:1,color:'#64748b'}],recipes:[{id:'upgrade',outputItemId:'high',outputQuantity:2,ingredients:[{itemId:'low',quantity:3}],currencyCosts:[{itemId:'coin',quantity:5}],enabled:true},{id:'lower',outputItemId:'low',outputQuantity:3,ingredients:[{itemId:'raw',quantity:2}],enabled:true}]};
const request:CraftRequest = {recipeId:'upgrade',quantity:2,chained:false,recipeChoices:{}};
const stock = [item('low',9),item('high',0),item('coin',30),item('raw',20)];
const rules:CharacterRules = {levelCap:10,rarities:[1],weaponTypes:[],damageTypes:[],roles:[],equipmentSlots:[],progressionTracks:[],inventory:config};

await test('crafting is game-configured across all eight games and never mutates inputs during a preview', () => {
    for (const game of ['endfield','fgo','genshin','gfl2','hsr','wuwa','zzz','nte']) {
        const entries = stock.map(entry => ({...entry,game}));
        const before = structuredClone(entries);
        assert.deepEqual(craftInventory(entries,game,config,request),{low:3,high:4,coin:20});
        assert.equal(craftableBatches(entries,game,config,request,new Map()),3);
        assert.deepEqual(entries,before);
        assert.throws(() => craftInventory(entries,'other-game',config,request),/unavailable/);
    }
});
await test('crafting reserves plan materials, sums repeated ingredients and currency, enforces unlocks and stack limits', () => {
    assert.throws(() => craftInventory(stock,'genshin',config,request,new Map([['low',4]])),/Not enough/);
    const repeated = structuredClone(config); repeated.recipes[0].ingredients.push({itemId:'low',quantity:1});
    assert.deepEqual(craftInventory(stock,'genshin',repeated,request),{low:1,high:4,coin:20});
    const locked = structuredClone(config);locked.recipes[0].unlockContentIds=['quest'];
    assert.throws(() => craftInventory(stock,'genshin',locked,request),/unlock/);
    assert.doesNotThrow(() => craftInventory([...stock,{...item('quest',0),kind:'story',completed:true}],'genshin',locked,request));
    assert.throws(() => craftInventory(stock.map(entry => entry.id === 'high' ? {...entry,maxStack:3}:entry),'genshin',config,request),/stack limit/);
    for (const quantity of [-1,0,1.5,NaN,Infinity]) {assert.throws(() => craftInventory(stock,'genshin',config,{...request,quantity}));}
});
await test('chained crafting uses all costs and requires an explicit choice for alternative paths; cycles are rejected', () => {
    const emptyLow = stock.map(entry => entry.id === 'low' ? {...entry,quantity:0}:entry);
    assert.deepEqual(craftInventory(emptyLow,'genshin',config,{...request,chained:true}),{high:4,coin:20,raw:16});
    const alternatives=structuredClone(config);alternatives.recipes.push({...alternatives.recipes[1],id:'alternative'});
    assert.throws(() => craftInventory(emptyLow,'genshin',alternatives,{...request,chained:true}),/Choose/);
    assert.doesNotThrow(() => craftInventory(emptyLow,'genshin',alternatives,{...request,chained:true,recipeChoices:{low:'lower'}}));
    const cyclic=structuredClone(config);cyclic.recipes[1].ingredients=[{itemId:'high',quantity:1}];
    assert.equal(validInventoryConfig(cyclic),false);
    const categories=structuredClone(config);categories.categories[0].parentCategoryId='materials';assert.equal(validInventoryConfig(categories),false);
});
await test('requirements share profile progression calculations, aggregate equipment once, and do not count unused materials as sufficient', () => {
    const material=item('low',9);
    const definition={...emptyCharacterDefinition(),progressionProfileId:'standard'};
    const profile={...rules,progressionProfiles:[{id:'standard',gameId:'genshin',tracks:[{id:'level',label:'Level',type:'level' as const,minValue:1,maxValue:2,displayOrder:0,upgradeCosts:[{fromValue:1,toValue:2,materials:[{itemId:'low',quantity:4}]}]}]}]};
    const character:Entry={...item('hero',0),kind:'characters',characterDefinition:definition,characterCollection:{...emptyCharacterCollection(),owned:true,target:{level:2,gear:{},progression:{}}}};
    const equipment:Entry={...item('weapon',1),equipmentDefinition:{typeId:'sword',progressionTracks:[{id:'level',label:'Level',type:'level',minValue:1,maxValue:2,displayOrder:0,upgradeCosts:[{fromValue:1,toValue:2,materials:[{itemId:'low',quantity:3}]}]}]},equipmentInstances:[{id:'copy',current:{level:1,gear:{},progression:{}},target:{level:2,gear:{},progression:{}}}]};
    const entries=[material,character,equipment];
    assert.equal(inventoryItems(entries,'genshin',profile)[0].required,7);
    character.characterCollection!.gear={weapon:['copy']};
    assert.equal(inventoryItems(entries,'genshin',profile)[0].required,7);
    assert.equal(requirementStatus(100,0),'not-required');assert.equal(requirementStatus(0,4),'missing');assert.equal(requirementStatus(2,4),'partial');assert.equal(requirementStatus(4,4),'sufficient');
});
await test('craft API authenticates, validates unlocks and stock, rejects stale revisions and atomically isolates account changes', async () => {
    const state:Record<string,PlayerState>=Object.fromEntries(stock.map(entry => [`genshin/${entry.id}`,{quantity:entry.quantity,target:0,completed:false}]));
    let revision=0, writes=0;
    const progress:AccountProgressRepository={async read(user){return user === 'test' ? {revision,state:structuredClone(state)} : {revision:0,state:{}};},async patch(user,expected,changes){assert.equal(user,'test');if(expected !== revision){throw new ApiError(409,'stale');}Object.assign(state,changes);writes++;return {revision:++revision,state:structuredClone(state)};}};
    const repository:CatalogRepository={async read(game){return {id:game,name:game,revision:0,entries:stock.map(toCatalog),characterRules:rules};},async write(){throw new Error('Crafting must never write the shared catalog.');},async parsed(){return {};}};
    const security={...editorFixture,async requireUser(req:Parameters<typeof editorFixture.requireUser>[0]){if(req.headers['authorization'] !== 'Bearer fixture'){throw new ApiError(401,'Sign in.');}return {id:req.headers['x-account']==='other'?'other':'test',name:'Player',editor:false,csrf:''};}};
    const server=createApi(repository,[],async()=>true,globalThis.undefined,security,progress);
    await new Promise<void>(resolve=>{server.listen(0,'127.0.0.1',resolve);});
    try {
        const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/me/inventory/genshin/craft`;
        const send=(payload:unknown,authorization='Bearer fixture',account='test')=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',authorization,'x-account':account},body:JSON.stringify(payload)});
        assert.equal((await send({...request,revision:0},'')).status,401);
        assert.equal((await send({...request,revision:0},'Bearer fixture','other')).status,400);
        assert.equal(writes,0);
        assert.equal((await send({...request,revision:0})).status,200);
        assert.equal(writes,1);assert.equal(state['genshin/low'].quantity,3);assert.equal(state['genshin/high'].quantity,4);assert.equal(state['genshin/coin'].quantity,20);
        assert.equal((await send({...request,revision:0})).status,409);
        assert.equal((await send({...request,revision:1,quantity:100})).status,400);
        assert.equal(writes,1);assert.equal(state['genshin/high'].quantity,4);
        const concurrent=await Promise.all([send({...request,revision:1,quantity:1}),send({...request,revision:1,quantity:1})]);
        assert.deepEqual(concurrent.map(response=>response.status).sort(),[200,409]);assert.equal(writes,2);assert.equal(state['genshin/high'].quantity,6);
    } finally {server.closeAllConnections();await new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());});}
});
