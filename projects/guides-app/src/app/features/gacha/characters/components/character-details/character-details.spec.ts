import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {signal} from '@angular/core';
import {CharacterDetails} from './character-details';
import {WorkspaceStore} from '../../../../../core/state/workspace.store';
import type {Entry} from '@lib/types/workspace.type';
import type {CharacterRules} from '@lib/types/character.type';
import {emptyCharacterCollection,emptyCharacterDefinition} from '@common/characters/characters';
import {emptyPatchOverview} from '@common/quests/story-template';

const rules:CharacterRules = {levelCap:80,rarities:[5],weaponTypes:[],damageTypes:[],roles:[],equipmentSlots:[],progressionTracks:[],ascensionRanks:[{levelCap:20,skillLevelCap:2},{levelCap:80,skillLevelCap:5}]};
const character:Entry = {id:'hero',game:'endfield',kind:'characters',name:'Hero',rarity:5,category:'',notes:'Catalog description',order:0,day:'',members:[],requirements:[],quantity:0,target:0,completed:false,characterDefinition:{...emptyCharacterDefinition(),headshot:'https://example.com/headshot.png',skills:[{id:'attack',name:'Attack',description:'Configured skill',maxLevel:5}],guides:[{title:'Build guide',url:'https://example.com/guide'}]},characterCollection:{...emptyCharacterCollection(),level:20}};
async function setup(entry = character,configuration = rules,extra:Entry[] = []) {
    const entries = signal(structuredClone([entry,...extra]));
    const saveCharacterCollection = vi.fn(async () => true), saveCharacterDetails = vi.fn(async () => true);
    const store = {entries,saving:signal(false),loading:signal(false),error:signal(''),saveCharacterCollection,saveCharacterDetails};
    TestBed.configureTestingModule({providers:[provideRouter([]),{provide:WorkspaceStore,useValue:store}]});
    const fixture = TestBed.createComponent(CharacterDetails);
    fixture.componentRef.setInput('entry',entries()[0]);fixture.componentRef.setInput('entries',entries());fixture.componentRef.setInput('rules',structuredClone(configuration));fixture.detectChanges();
    return {fixture,dialog:fixture.componentInstance,root:fixture.nativeElement as HTMLElement,store};
}
describe('Character Details',() => {
    it('uses the character banner for the header, falling back to splash art while keeping the icon separate',async () => {
        const entry = {...character,characterDefinition:{...character.characterDefinition!,banner:'/api/games/genshin/images/banner.webp'},characterInformation:{...emptyPatchOverview(),imageUrl:'/api/games/genshin/images/splash.webp'}};
        const {fixture,root,dialog} = await setup(entry);
        expect(root.querySelector('.details-header-art')?.getAttribute('src')).toBe('/api/games/genshin/images/banner.webp');
        expect(root.querySelector('.details-headshot img')?.getAttribute('src')).toContain('headshot');
        expect(dialog.artwork()).toBe('/api/games/genshin/images/splash.webp');
        root.querySelector('.details-header-art')!.dispatchEvent(new Event('error'));
        fixture.detectChanges();
        expect(root.querySelector('.details-header-art')?.getAttribute('src')).toBe('/api/games/genshin/images/splash.webp');
        root.querySelector('.details-header-art')!.dispatchEvent(new Event('error'));
        fixture.detectChanges();
        expect(root.querySelector('.details-header-art')).toBeNull();
    });
    it('groups header actions and shows damage and weapon icons with a fallback for failed images',async () => {
        const entry = {...character,characterDefinition:{...character.characterDefinition!,damageType:'Physical',weaponType:'Sword'},characterInformation:{...emptyPatchOverview(),damageTypeIcon:'/assets/physical.webp'}};
        const {fixture,root} = await setup(entry);
        const actions = root.querySelector('.details-header-actions')!;
        expect(actions.querySelector('.details-owned')).not.toBeNull();
        expect(actions.querySelector('.details-favorite svg')).not.toBeNull();
        expect(actions.querySelector('.details-header-menu summary svg')).not.toBeNull();
        expect(root.querySelector('.details-close svg')).not.toBeNull();
        const attributes = root.querySelectorAll('.details-attribute');
        expect(attributes[0].textContent).toContain('Physical');expect(attributes[0].querySelector('img')?.getAttribute('src')).toBe('/assets/physical.webp');
        expect(attributes[1].textContent).toContain('Sword');expect(attributes[1].querySelector('svg')).not.toBeNull();
        attributes[0].querySelector('img')!.dispatchEvent(new Event('error'));fixture.detectChanges();
        expect(root.querySelector('.details-attribute img')).toBeNull();expect(root.querySelector('.details-attribute svg')).not.toBeNull();
    });
    it('renders the reference header from shared data without inventing missing metadata',async () => {
        const entry = {...character,rarity:5,characterDefinition:{...character.characterDefinition!,attributes:{constellation:'Cisoria',organization:'Court of Fontaine',birthday:'August 17'}},characterInformation:{...emptyPatchOverview(),imageUrl:'https://example.com/full-art.webp',subtitle:'The Thundering Seamstress',releaseDate:'2024-03-12'}};
        const {fixture,dialog,root} = await setup(entry);
        fixture.componentRef.setInput('gameName','Genshin Impact');fixture.detectChanges();
        expect(root.querySelector('.details-breadcrumb')?.textContent).toContain('Genshin Impact');
        expect(root.querySelector('.details-subtitle')?.textContent).toBe('The Thundering Seamstress');
        expect(root.querySelectorAll('.details-rarity>svg')).toHaveLength(5);
        expect(root.querySelector('.details-header-art')?.getAttribute('src')).toBe('https://example.com/full-art.webp');
        expect(dialog.headerFacts().map(fact => fact.value)).toEqual(['Cisoria','Court of Fontaine','August 17','Mar 12, 2024']);
        const menu = root.querySelector<HTMLDetailsElement>('.details-header-menu')!;
        menu.open = true;root.querySelector('.details-identity')!.dispatchEvent(new MouseEvent('click',{bubbles:true}));expect(menu.open).toBe(false);
        menu.open = true;menu.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(menu.open).toBe(false);expect(dialog.discard).toBe(false);
        fixture.componentRef.setInput('entry',character);fixture.detectChanges();expect(dialog.headerFacts()).toEqual([]);expect(root.querySelector('.details-header-facts')).toBeNull();expect(root.querySelector('.details-subtitle')).toBeNull();
    });
    it.each(['endfield','genshin','fgo','gfl2','hsr','wuwa','zzz','nte'])('uses the same configurable dialog for %s',async game => {
        const {dialog,root} = await setup({...character,game});
        expect(root.querySelector('.details-layout .details-sidebar')).not.toBeNull();
        expect(dialog.tabs().map(tab => tab.id)).toEqual(['level','skills']);
        expect(root.querySelectorAll('.details-track').length).toBe(2);
        expect(root.querySelector('.details-headshot img')?.getAttribute('src')).toContain('headshot');
        expect(dialog.build.level).toBe(20);
    });
    it('keeps progression and resource expansion across tabs, resolves promotion and separates planning completion',async () => {
        const {dialog,fixture,root,store} = await setup();
        const level = dialog.levelTracks().find(track => track.type === 'level')!;
        const resource = root.querySelector<HTMLDetailsElement>('.resource-group')!;resource.open = true;
        dialog.changeTrack(level,{target:true,value:80});
        expect(dialog.build.level).toBe(20);expect(dialog.build.target?.ascensionRank).toBe(1);
        expect(dialog.milestones()).toEqual([{rank:1,levelCap:80}]);
        dialog.tab = 'skills';fixture.detectChanges();dialog.tab = 'level';fixture.detectChanges();
        expect(root.querySelector<HTMLDetailsElement>('.resource-group')!.open).toBe(true);expect(dialog.target().level).toBe(80);
        dialog.goalComplete();expect(dialog.build.completedGoals?.['level']).toBe(true);expect(dialog.build.level).toBe(20);
        await dialog.save();expect(store.saveCharacterCollection).toHaveBeenCalledWith('hero',expect.objectContaining({level:20,target:expect.objectContaining({level:80}) as unknown,completedGoals:{level:true}}));
        dialog.setCurrentToTarget();expect(dialog.build.level).toBe(80);expect(dialog.build.ascensionRank).toBe(1);
    });
    it('edits unlock nodes and rejects unmet prerequisites while retaining a failed-save draft',async () => {
        const profile = {...rules,progressionProfiles:[{id:'profile',gameId:'endfield',tracks:[{id:'root',label:'Root',type:'unlock' as const,displayOrder:0},{id:'branch',label:'Branch',type:'unlock' as const,displayOrder:1,dependencies:[{trackId:'root',requiredValue:1}]}]}]};
        const {dialog,store} = await setup({...character,characterDefinition:{...character.characterDefinition!,progressionProfileId:'profile'}},profile);
        dialog.changeTrack(dialog.skillTracks()[1],{target:true,value:1});await dialog.save();
        expect(store.saveCharacterCollection).not.toHaveBeenCalled();expect(dialog.error).toContain('prerequisites');
        dialog.changeTrack(dialog.skillTracks()[0],{target:true,value:1});store.saveCharacterCollection.mockResolvedValueOnce(false);
        await dialog.save();expect(dialog.dirty()).toBe(true);expect(dialog.build.target?.nodeStates?.['branch'].unlocked).toBe(true);expect(dialog.error).toContain('draft');
    });
    it('keeps unowned planning separate and hides unsupported tabs for nonplayable characters',async () => {
        const {dialog} = await setup({...character,characterCollection:globalThis.undefined,characterDefinition:{...character.characterDefinition!,attributes:{playable:false}}});
        expect(dialog.build.owned).toBe(false);expect(dialog.tabs()).toEqual([]);
        dialog.build.favorite = true;const closed = vi.fn();dialog.closed.subscribe(closed);dialog.close();expect(dialog.discard).toBe(true);expect(closed).not.toHaveBeenCalled();dialog.finishClose();expect(closed).toHaveBeenCalledOnce();
    });
    it('assigns an owned equipment copy, retains it when unequipped and calculates actual inventory deficits',async () => {
        const configuration = {...rules,equipmentSlots:[{id:'weapon',label:'Weapon',system:'weapon' as const,limit:1,allowedTypes:['sword']}]};
        const ore:Entry = {...character,id:'ore',kind:'inventory',name:'Ore',quantity:3,characterDefinition:globalThis.undefined,characterCollection:globalThis.undefined};
        const sword:Entry = {...ore,id:'sword',name:'Sword',quantity:1,equipmentDefinition:{typeId:'sword',progressionTracks:[{id:'weapon-level',label:'Weapon level',type:'level',minValue:1,maxValue:2,displayOrder:0,upgradeCosts:[{fromValue:1,toValue:2,materials:[{itemId:'ore',quantity:7}]}]}]}};
        const {dialog,store} = await setup(character,configuration,[ore,sword]);const slot = configuration.equipmentSlots[0];
        dialog.assign(slot,0,'new:sword');const copy = dialog.copies()[0];
        expect(dialog.build.gear['weapon']).toEqual([copy.instance.id]);
        dialog.changeEquipment(copy,copy.item.equipmentDefinition!.progressionTracks![0],{target:true,value:2});
        expect(dialog.materialPlan().materials.find(row => row.item.id === 'ore')).toEqual(expect.objectContaining({required:7,owned:3,missing:4}));
        await dialog.save();expect(store.saveCharacterDetails).toHaveBeenCalledOnce();
        dialog.build.owned = false;
        dialog.assign(slot,0,'');expect(dialog.copies().length).toBe(1);expect(dialog.build.gear['weapon']).toEqual([]);
    });
    it('uses configured set thresholds and keeps keyboard tab navigation within the dialog',async () => {
        const configuration = {...rules,equipmentSlots:[{id:'armor',label:'Armor',limit:3,allowedTypes:['armor']}]};
        const equipment:Entry = {...character,id:'armor-item',kind:'inventory',characterCollection:globalThis.undefined,characterDefinition:globalThis.undefined,quantity:3,equipmentDefinition:{typeId:'armor',setId:'set',setBonuses:[{pieces:3,description:'Configured three-piece bonus'}]},equipmentInstances:[1,2,3].map(index => ({id:`copy-${index}`,current:{level:1,gear:{},progression:{}}}))};
        const {dialog,fixture,root} = await setup({...character,characterCollection:{...emptyCharacterCollection(),gear:{armor:['copy-1','copy-2']}}},configuration,[equipment]);
        expect(dialog.sets()).toEqual([]);dialog.assign(configuration.equipmentSlots[0],2,'copy-3');
        expect(dialog.sets()).toEqual([{id:'set',pieces:3,description:'Configured three-piece bonus'}]);
        root.querySelector('[role="tablist"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));fixture.detectChanges();
        expect(dialog.tab).toBe('equipment');expect(root.textContent).toContain('Configured three-piece bonus');
    });
});
