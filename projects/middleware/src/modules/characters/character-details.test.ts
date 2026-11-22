import {test} from 'node:test';
import assert from 'node:assert/strict';
import {characterDetailsTracks,characterTarget,requiredPromotion,setCharacterTrack} from '@common/characters/character-details';
import {characterMaterialCosts,progressionMaterialCosts} from '@common/characters/character-materials';
import {validEquipmentDefinition,validEquipmentInstances,equipmentAccountIssues} from '@common/characters/character-equipment';
import {emptyCharacterCollection,emptyCharacterDefinition,characterCollectionFits,validCharacterCollection} from '@common/characters/characters';
import {toCatalog,fromCatalog,validCatalog} from '@common/workspace/workspace';
import type {CharacterRules} from '@lib/types/character.type';
import type {Entry,PlayerState,CatalogEntry} from '@lib/types/workspace.type';
import type {EquipmentInstance} from '@lib/types/equipment.type';
import {ProgressService} from '../progress/progress.service';
import type {CatalogRepository,AccountProgressRepository} from '../../app/app.types';
import {farmingRequirements} from '@common/farming/farming';

const rules:CharacterRules = {levelCap:80,rarities:[5],weaponTypes:[],damageTypes:[],roles:[],equipmentSlots:[{id:'weapon',label:'Weapon',system:'weapon',limit:1,allowedTypes:['sword']}],progressionTracks:[],ascensionRanks:[{levelCap:20,skillLevelCap:2},{levelCap:80,skillLevelCap:5}]};
const character:Entry = {id:'hero',game:'endfield',kind:'characters',name:'Hero',rarity:5,notes:'',category:'',order:0,day:'',members:[],requirements:[],completed:false,quantity:0,target:0,characterDefinition:{...emptyCharacterDefinition(),weaponType:'Sword',skills:[{id:'attack',name:'Attack',description:'Skill',maxLevel:5}]}};
const item:Entry = {...character,id:'sword',kind:'inventory',name:'Sword',quantity:2,characterDefinition:globalThis.undefined,equipmentDefinition:{typeId:'sword',weaponType:'Sword',progressionTracks:[{id:'level',label:'Weapon level',type:'level',minValue:1,maxValue:10,displayOrder:0}],setId:'set',setBonuses:[{pieces:3,description:'Three configured pieces'}]}};
const copy:EquipmentInstance = {id:'equipment-copy',current:{level:1,gear:{},progression:{}},target:{level:5,gear:{},progression:{}}};
const state = (extra:Partial<PlayerState> = {}):PlayerState => ({completed:false,quantity:0,target:0,...extra});

await test('detail controls project existing rules, preserve target maps, and resolve promotion without changing current values', () => {
    const collection = {...emptyCharacterCollection(),level:20,trackValues:{extra:2},nodeStates:{passive:{unlocked:true}}};
    const target = characterTarget(collection);target.level = 80;
    assert.equal(collection.level,20);assert.deepEqual(target.trackValues,{extra:2});assert.deepEqual(target.nodeStates,{passive:{unlocked:true}});
    assert.equal(requiredPromotion(rules,80),1);assert.equal(requiredPromotion(rules,81),null);
    const tracks = characterDetailsTracks(rules,character.characterDefinition);
    assert.equal(tracks.filter(track => track.type === 'skill').length,1);
    assert.equal(tracks.find(track => track.type === 'skill')?.storage?.key,'attack');
    assert.deepEqual(characterDetailsTracks(rules,{...character.characterDefinition!,attributes:{playable:false}}),[]);
    const node = {id:'node',label:'Node',type:'unlock' as const,displayOrder:0};
    const modern = {...rules,defaultProgressionProfileId:'profile',progressionProfiles:[{id:'profile',gameId:'endfield',tracks:[node]}]};
    const current = {...emptyCharacterCollection(),target:{level:1,gear:{},progression:{},nodeStates:{node:{unlocked:true}}}};
    assert.equal(characterCollectionFits(current,modern,emptyCharacterDefinition()),true);
    setCharacterTrack(current,node,1);assert.equal(current.nodeStates?.['node'].unlocked,true);
});
await test('material calculations deduplicate shared prerequisites, preserve missing costs, and reject ambiguous paths', () => {
    const current = {level:1,gear:{},progression:{}};
    const tracks = [
        {id:'root',label:'Root',type:'unlock' as const,displayOrder:0,upgradeCosts:[{fromValue:0,toValue:1,materials:[{itemId:'ore',quantity:5}]}]},
        ...['left','right'].map((id,index) => ({id,label:id,type:'unlock' as const,displayOrder:index + 1,dependencies:[{trackId:'root',requiredValue:1}],upgradeCosts:[{fromValue:0,toValue:1,materials:[{itemId:'ore',quantity:3}]}]})),
    ];
    const target = {...current,nodeStates:{left:{unlocked:true},right:{unlocked:true}}};
    const result = progressionMaterialCosts(tracks,current,target);
    assert.equal(result.costs.get('ore'),11);assert.deepEqual(result.issues,[]);
    assert.equal(progressionMaterialCosts(tracks,current,target,['left']).costs.get('ore'),8);
    const missing = progressionMaterialCosts([{...tracks[0],upgradeCosts:globalThis.undefined}],current,{...current,nodeStates:{root:{unlocked:true}}});
    assert.match(missing.issues.join(' '),/unavailable/);
    const ambiguous = progressionMaterialCosts([{id:'level',label:'Level',type:'level',minValue:1,maxValue:3,displayOrder:0,upgradeCosts:[{fromValue:1,toValue:2,materials:[]},{fromValue:2,toValue:3,materials:[]},{fromValue:1,toValue:3,materials:[]}]}],current,{...current,level:3});
    assert.match(ambiguous.issues.join(' '),/multiple upgrade paths/);
    const legacy = characterMaterialCosts({...emptyCharacterDefinition(),recipes:[{kind:'level',from:1,to:2,materials:[{item:'ore',amount:7}]}]}, {...emptyCharacterCollection(),target:{...current,level:2}},rules);
    assert.equal(legacy.costs.get('ore'),7);
});
await test('equipment ownership stays in account inventory and shared catalog retains definitions only', () => {
    const owned = {...item,equipmentInstances:[copy]};
    assert.equal(validEquipmentDefinition(item.equipmentDefinition),true);assert.equal(validEquipmentInstances([copy]),true);
    const shared = toCatalog(owned);
    assert.equal('equipmentInstances' in shared,false);assert.equal(validCatalog([shared],'endfield'),true);
    assert.deepEqual(fromCatalog(shared,state({quantity:2,equipmentInstances:[copy]})).equipmentInstances,[copy]);
    const missing = structuredClone(shared);missing.equipmentDefinition!.progressionTracks![0].upgradeCosts = [{fromValue:1,toValue:2,materials:[{itemId:'missing',quantity:1}]}];
    assert.equal(validCatalog([missing],'endfield'),false);
    const account = {'endfield/sword':state({quantity:2,equipmentInstances:[copy]}),'endfield/hero':state({characterCollection:{...emptyCharacterCollection(),gear:{weapon:[copy.id]}}})};
    assert.deepEqual(equipmentAccountIssues([toCatalog(character),shared],account,rules),[]);
    assert.ok(equipmentAccountIssues([toCatalog(character),shared],{...account,'endfield/sword':state({quantity:0,equipmentInstances:[copy]})},rules).length);
    const bad = structuredClone(copy);bad.target!.level = 11;
    assert.ok(equipmentAccountIssues([shared],{'endfield/sword':state({quantity:2,equipmentInstances:[bad]})},rules).length);
    assert.equal(validCharacterCollection({...emptyCharacterCollection(),completedGoals:{skills:true}}),true);
    assert.equal(validCharacterCollection({...emptyCharacterCollection(),completedGoals:{skills:'yes'}}),false);
});
await test('account updates atomically persist equipment and goals and reject duplicate assignment or foreign copies', async () => {
    const shared:CatalogEntry[] = [toCatalog(character),toCatalog({...character,id:'other'}),toCatalog(item)];
    const catalog:CatalogRepository = {async read(){return {id:'endfield',name:'Game',revision:0,entries:shared,characterRules:rules};},async parsed(){return {};},async write(){throw new Error('Account edits cannot change shared data');}};
    let revision = 0;let saved:Record<string,PlayerState> = {};
    const repository:AccountProgressRepository = {async read(){return {revision,state:saved};},async patch(_user,expected,changes){assert.equal(expected,revision);saved = {...saved,...changes};revision++;return {revision,state:saved};}};
    const service = new ProgressService(catalog,repository);
    const collection = {...emptyCharacterCollection(),gear:{weapon:[copy.id]},completedGoals:{level:true}};
    await service.patch('alice',{revision:0,changes:{'endfield/sword':state({quantity:2,equipmentInstances:[copy]}),'endfield/hero':state({characterCollection:collection})}});
    assert.equal(saved['endfield/hero'].characterCollection?.level,1);assert.deepEqual(saved['endfield/sword'].equipmentInstances,[copy]);
    await assert.rejects(service.patch('alice',{revision:1,changes:{'endfield/other':state({characterCollection:collection})}}),{status:400});
    await assert.rejects(service.patch('alice',{revision:1,changes:{'endfield/hero':state({characterCollection:{...collection,gear:{weapon:['equipment-foreign']}}})}}),{status:400});
    assert.equal(revision,1);assert.equal('equipmentInstances' in shared[2],false);
});
await test('farming aggregates profile and equipment costs using actual owned inventory quantities', () => {
    const weapon = {...item,equipmentDefinition:{...item.equipmentDefinition!,progressionTracks:[{id:'level',label:'Weapon level',type:'level' as const,minValue:1,maxValue:2,displayOrder:0,upgradeCosts:[{fromValue:1,toValue:2,materials:[{itemId:'ore',quantity:7}]}]}]},equipmentInstances:[{...copy,target:{...copy.current,level:2}}]};
    const ore = {...item,id:'ore',name:'Ore',quantity:3,equipmentDefinition:globalThis.undefined};
    const hero = {...character,characterCollection:{...emptyCharacterCollection(),gear:{weapon:[copy.id]}}};
    const plan = farmingRequirements([hero,weapon,ore],'endfield',['hero'],'characters',false,rules);
    assert.deepEqual(plan.issues,[]);assert.equal(plan.materials[0].required,7);assert.equal(plan.materials[0].owned,3);assert.equal(plan.materials[0].missing,4);
});
