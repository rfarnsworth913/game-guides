import {Component, input, output, inject, OnInit, ElementRef} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import type {Entry} from '@lib/types/workspace.type';
import type {CharacterCollection, CharacterRules, CharacterProgression} from '@lib/types/character.type';
import type {ProgressionTrackDefinition} from '@lib/types/character-extension.type';
import type {EquipmentInstance} from '@lib/types/equipment.type';
import {WorkspaceStore} from '../../../../../core/state/workspace.store';
import {DialogFocusDirective} from '../../../../../shared/directives/dialog-focus/dialog-focus';
import {CharacterTrackEditor} from './character-track-editor';
import {CharacterResources} from './character-resources';
import {FarmingMaterialTile} from '../../../shared/components/material-tile/farming-material';
import {characterCard} from '../../utils/character-inventory';
import {emptyCharacterCollection, emptyCharacterDefinition, characterCollectionFits, validCharacterCollection, guideUrl} from '@common/characters/characters';
import {characterDetailsTracks, characterTarget, setCharacterTrack, requiredPromotion, trackGoalPercent, progressionCap} from '@common/characters/character-details';
import {characterTrackValue, characterProgressIssues} from '@common/characters/character-progression';
import {characterMaterialCosts, progressionMaterialCosts} from '@common/characters/character-materials';
import {equipmentFits,equipmentInstanceIssues} from '@common/characters/character-equipment';
import {trackMinimum,characterHeadshotUrl} from '@common/characters/character-extension';
import {storyImageUrl} from '@common/quests/story-template';

type EquipmentCopy = {item:Entry;instance:EquipmentInstance};
@Component({
    selector:'gg-character-details',
    imports:[FormsModule,RouterLink,DialogFocusDirective,CharacterTrackEditor,CharacterResources,FarmingMaterialTile],
    templateUrl:'./character-details.html',
    styleUrls:['./character-details-shell.scss','./character-details-header.scss','./character-details-header-actions.scss','./character-details-header-facts.scss','./character-details.scss','./character-details-fields.scss'],
    host:{'(document:click)':'dismissHeaderMenu($event)'},
})
export class CharacterDetails implements OnInit {
    readonly entry = input.required<Entry>();
    readonly gameName = input('');
    readonly rules = input<CharacterRules>();
    readonly entries = input<Entry[]>([]);
    readonly accent = input('var(--color-primary)');
    readonly canEdit = input(false);
    readonly closed = output<void>();
    readonly editCatalog = output<void>();
    readonly store = inject(WorkspaceStore);
    private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
    build!:CharacterCollection;
    inventory:Entry[] = [];
    tab = '';
    error = '';
    message = '';
    saving = false;
    discard = false;
    removePrompt = false;
    showReference = false;
    editAfterClose = false;
    artworkFailed = false;
    fallbackArtworkFailed = false;
    headshotFailed = false;
    headerArtworkFailed = false;
    headerBannerFailed = false;
    readonly failedClassificationIcons = new Set<string>();
    private baseline = '';
    private inventoryBaseline = new Map<string,string>();
    ngOnInit():void {
        const entry = this.entry();
        this.build = structuredClone(entry.characterCollection ?? {...emptyCharacterCollection(),owned:false});
        if (!entry.characterCollection) {
            const level = this.rules() ? characterDetailsTracks(this.rules()!,entry.characterDefinition).find(track => track.type === 'level') : null;
            if (level) {this.build.level = trackMinimum(level);}
        }
        this.inventory = structuredClone(this.entries().filter(item => item.game === entry.game && item.kind === 'inventory'));
        this.inventoryBaseline = new Map(this.inventory.map(item => [item.id,JSON.stringify(item.equipmentInstances ?? [])]));
        this.tab = this.tabs()[0]?.id ?? '';
        this.baseline = this.snapshot();
    }
    busy():boolean {return this.saving || this.store.saving() || this.store.loading();}
    tabKey(event:KeyboardEvent):void {
        const tabs = this.tabs(), index = tabs.findIndex(tab => tab.id === this.tab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : null;
        if (next === null || !tabs.length) {return;}event.preventDefault();this.tab = tabs[next]!.id;
        (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }
    definition() {return this.entry().characterDefinition ?? emptyCharacterDefinition();}
    card() {return characterCard(this.entry(),this.rules());}
    gameTitle():string {return this.gameName() || this.store.games?.().find(game => game.gameId === this.entry().game)?.name || this.entry().game;}
    rarityStars():number[] {return Number.isInteger(this.entry().rarity) && this.entry().rarity > 0 && this.entry().rarity <= 20 ? Array.from({length:this.entry().rarity},(_,index) => index) : [];}
    private headerAttribute(ids:string[]):{id:string;value:string}|null {
        for (const id of ids) {
            const match = Object.entries(this.definition().attributes ?? {}).find(([key]) => key.replace(/[-_ ]/g,'').toLowerCase() === id && this.rules()?.attributes?.find(attribute => attribute.id === key)?.visibleInDetails !== false);
            if (!match || typeof match[1] === 'boolean') {continue;}
            const value = Array.isArray(match[1]) ? match[1].join(', ') : String(match[1]);
            if(value.trim()){return {id:match[0],value};}
        }
        return null;
    }
    subtitle():string {return this.entry().characterInformation?.subtitle || this.headerAttribute(['title','epithet','subtitle'])?.value || '';}
    headerArtwork():string|null {
        if(this.headerArtworkFailed){return null;}
        const value = !this.headerBannerFailed && this.definition().banner || this.entry().characterInformation?.imageUrl || '';
        const url = characterHeadshotUrl(value);
        return url && /^(assets|icons|images)\//.test(url) ? `/${url}` : url;
    }
    failHeaderArtwork():void {
        if (this.definition().banner && !this.headerBannerFailed) {this.headerBannerFailed = true;}
        else {this.headerArtworkFailed = true;}
    }
    headerFacts():{id:string;label:string;value:string;icon:string}[] {
        const facts:{id:string;label:string;value:string;icon:string}[] = [];
        const constellation = this.headerAttribute(['constellation']);
        if(constellation){facts.push({id:'constellation',label:'Constellation',value:constellation.value,icon:'m4 4 16 16M20 4 4 20M3 8l5-5M16 21l5-5M3 16l5 5M16 3l5 5'});}
        const organization = this.headerAttribute(['organization','organisation','affiliation','faction']);
        const faction = organization?.value || this.entry().characterInformation?.faction;
        if(faction){facts.push({id:'organization',label:organization ? this.rules()?.attributes?.find(attribute => attribute.id === organization.id)?.label || (organization.id.toLowerCase() === 'faction' ? 'Faction' : 'Organization') : 'Faction',value:faction,icon:'m3 9 9-6 9 6H3ZM5 11v8M10 11v8M14 11v8M19 11v8M3 21h18'});}
        const birthday = this.headerAttribute(['birthday','birthdate']);
        if(birthday){facts.push({id:'birthday',label:'Birthday',value:birthday.value,icon:'M4 12h16v9H4zM4 16c2-3 4 3 6 0s4 3 6 0 4 0 4 0M8 12V8m4 4V8m4 4V8M8 3v2m4-2v2m4-2v2'});}
        const release = this.headerAttribute(['releasedate','release'])?.value || this.entry().characterInformation?.releaseDate;
        if(release){
            const date = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(release) ? new Date(release.length === 10 ? `${release}T00:00:00Z` : release) : null;
            const value = date && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === release.slice(0,10) ? date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}) : release;
            facts.push({id:'release',label:'Release',value,icon:'M4 5h16v16H4zM8 2v6m8-6v6M4 11h16'});
        }
        return facts;
    }
    dismissHeaderMenu(event:MouseEvent):void {
        const menu = this.hostElement.nativeElement.querySelector<HTMLDetailsElement>('.details-header-menu[open]');
        if(menu && !event.composedPath().includes(menu)){menu.open = false;}
    }
    closeHeaderMenu(event:Event):void {
        const menu = event.currentTarget as HTMLDetailsElement;
        if(!menu.open){return;}
        event.stopPropagation();
        menu.open = false;menu.querySelector('summary')?.focus();
    }
    classificationIcon(id:string):string|null {
        if (id !== 'damageType' || this.failedClassificationIcons.has(id)) {return null;}
        const value = this.entry().characterInformation?.damageTypeIcon ?? '';
        const url = characterHeadshotUrl(value);
        return url && /^(assets|icons|images)\//.test(url) ? `/${url}` : url;
    }
    classificationSymbol(id:string):string|null {
        const value = id === 'damageType' ? this.entry().characterInformation?.damageTypeIcon : null;
        return value && value.length <= 16 && !value.includes('/') && !value.includes(':') ? value : null;
    }
    referenceAttributes():{id:string;label:string;value:string}[] {
        const card = this.card(), configured = this.rules()?.attributes;
        return configured?.length ? configured.filter(attribute => attribute.visibleInDetails !== false).slice().sort((a,b) => a.displayOrder - b.displayOrder).flatMap(attribute => card.attributeValues[attribute.id]?.length ? [{id:attribute.id,label:attribute.label,value:card.attributeValues[attribute.id]!.join(', ')}] : []) : card.attributes;
    }
    addPersonalGuide():void {(this.build.personalGuides ??= []).push({title:'',url:''});}
    tracks():ProgressionTrackDefinition[] {return this.rules() ? characterDetailsTracks(this.rules()!,this.definition()) : [];}
    skillTracks():ProgressionTrackDefinition[] {return this.tracks().filter(track => track.type === 'skill' || track.type === 'unlock' || track.storage?.field === 'skillLevels');}
    levelTracks():ProgressionTrackDefinition[] {const skills = new Set(this.skillTracks().map(track => track.id)); return this.tracks().filter(track => !skills.has(track.id));}
    isWeapon(slot:CharacterRules['equipmentSlots'][number]):boolean {return slot.system === 'weapon' || (!slot.system && slot.id.toLowerCase() === 'weapon');}
    slots(weapon:boolean) {return (this.rules()?.equipmentSlots ?? []).filter(slot => this.isWeapon(slot) === weapon);}
    tabs():{id:string;label:string}[] {
        if (this.definition().attributes?.['playable'] === false) {return [];}
        return [...(this.levelTracks().length ? [{id:'level',label:this.levelTracks().some(track => track.type === 'level') ? 'Level & Promotion' : 'Progression'}] : []), ...(this.skillTracks().length ? [{id:'skills',label:'Skills'}] : []), ...(this.slots(true).length ? [{id:'weapon',label:this.slots(true).length === 1 ? this.slots(true)[0]!.label : 'Weapon'}] : []), ...(this.slots(false).length ? [{id:'equipment',label:'Equipment'}] : [])];
    }
    target():CharacterProgression {return this.build.target ? {...this.build,...this.build.target,trackValues:{...this.build.trackValues,...this.build.target.trackValues},nodeStates:{...this.build.nodeStates,...this.build.target.nodeStates}} : this.build;}
    changeTrack(track:ProgressionTrackDefinition, change:{target:boolean;value:number}):void {
        if (this.busy()) {return;}
        const state = change.target ? characterTarget(this.build) : this.build;
        setCharacterTrack(state,track,change.value);
        if (change.target && (track.type === 'level' || track.storage?.field === 'level') && this.rules()?.ascensionRanks?.length) {
            const rank = requiredPromotion(this.rules()!,change.value);
            if (rank !== null) {state.ascensionRank = Math.max(state.ascensionRank ?? 0,rank);}
        }
        this.reopen();
    }
    cap(track:ProgressionTrackDefinition,target=false):number {return progressionCap(this.rules()!,target ? this.target() : this.build,track);}
    value(track:ProgressionTrackDefinition,target=false):number {return characterTrackValue(target ? this.target() : this.build,track);}
    percent():number {return trackGoalPercent(this.build,this.target(),this.tab === 'skills' ? this.skillTracks() : this.levelTracks());}
    milestones():{rank:number;levelCap:number}[] {return (this.rules()?.ascensionRanks ?? []).map((rank,index) => ({rank:index,levelCap:rank.levelCap})).filter(rank => rank.rank > (this.build.ascensionRank ?? 0) && rank.rank <= (this.target().ascensionRank ?? 0));}
    description(track:ProgressionTrackDefinition):string {
        const ability = this.definition().abilities?.find(ability => ability.id === track.abilityId || ability.progressionTrackId === track.id);
        const skills = [...this.definition().skills,...this.definition().passiveSkills];
        return ability?.description ?? skills.find(skill => skill.id === track.storage?.key || skill.name === track.label)?.description ?? '';
    }
    skillIcon(track:ProgressionTrackDefinition):string|null {return storyImageUrl(this.definition().abilities?.find(ability => ability.id === track.abilityId || ability.progressionTrackId === track.id)?.icon ?? '');}
    skillCost(track:ProgressionTrackDefinition) {
        const result = characterMaterialCosts(this.definition(),this.build,this.rules()!,[track.id]);
        return {issues:result.issues,materials:[...result.costs].map(([id,required]) => ({id,name:this.inventory.find(item => item.id === id)?.name ?? 'Missing material',required}))};
    }
    artwork():string|null {return this.artworkFailed ? this.fallbackArtworkFailed ? null : this.card().headshotUrl : storyImageUrl(this.entry().characterInformation?.imageUrl ?? '') || this.card().headshotUrl;}
    failArtwork():void {if(this.artworkFailed){this.fallbackArtworkFailed = true;}else{this.artworkFailed = true;}}
    snapshot():string {return JSON.stringify({build:this.build,inventory:this.inventory.map(item => ({id:item.id,instances:item.equipmentInstances}))});}
    dirty():boolean {return this.snapshot() !== this.baseline;}
    close(edit=false):void {if(this.busy()){return;} this.editAfterClose = edit; if(this.dirty()){this.discard = true;}else{this.finishClose();}}
    finishClose():void {if(this.editAfterClose){this.editCatalog.emit();}else{this.closed.emit();}}
    reopen():void {if(this.build.completedGoals){this.build.completedGoals[this.tab] = false;} this.message = '';}
    goalComplete():void {(this.build.completedGoals ??= {})[this.tab] = !this.build.completedGoals?.[this.tab]; this.message = 'Planning status changed. Save to keep it; actual progression is unchanged.';}
    setCurrentToTarget():void {
        if (!this.build.owned || !this.build.target) {return;}
        const next = structuredClone(this.build);
        for (const track of this.tab === 'skills' ? this.skillTracks() : this.levelTracks()) {setCharacterTrack(next,track,characterTrackValue(this.target(),track));}
        if (!this.rules() || !characterCollectionFits(next,this.rules()!,this.definition(),this.entry().characterCollection)) {this.error = 'The target cannot be applied until all progression prerequisites and caps are satisfied.'; return;}
        this.build = next; this.message = 'Current progression updated in this draft. Save to keep it.';
    }
    copies():EquipmentCopy[] {return this.inventory.flatMap(item => (item.equipmentInstances ?? []).map(instance => ({item,instance})));}
    copy(id:string):EquipmentCopy|undefined {return this.copies().find(copy => copy.instance.id === id);}
    compatible(slot:CharacterRules['equipmentSlots'][number]):Entry[] {return this.inventory.filter(item => item.quantity > 0 && equipmentFits(slot,item,this.definition()));}
    assignedTo(id:string):string {
        const other = this.entries().find(entry => entry.game === this.entry().game && entry.kind === 'characters' && entry.id !== this.entry().id && Object.values(entry.characterCollection?.gear ?? {}).some(ids => ids.includes(id)));
        if(other){return other.name;}
        return Object.values(this.build.gear).some(ids => ids.includes(id)) ? 'this character' : '';
    }
    positions(slot:CharacterRules['equipmentSlots'][number]):number[] {return Array.from({length:Math.min(slot.limit,Math.max(1,(this.build.gear[slot.id]?.length ?? 0) + 1))},(_,index) => index);}
    assign(slot:CharacterRules['equipmentSlots'][number],index:number,value:string):void {
        if (!this.build.owned && value) {this.error = 'Mark this character owned before equipping an item. Existing equipment can still be unequipped.';return;}
        const ids = this.build.gear[slot.id] ??= [];
        if (!value) {ids.splice(index,1);this.reopen();return;}
        if (value.startsWith('new:')) {
            const item = this.compatible(slot).find(item => item.id === value.slice(4));
            if (!item || (item.equipmentInstances?.length ?? 0) >= item.quantity) {this.error = 'No untracked owned copies remain for this item.';return;}
            const level = item.equipmentDefinition?.progressionTracks?.find(track => track.type === 'level');
            const instance:EquipmentInstance = {id:`equipment-${crypto.randomUUID()}`,current:{level:level ? trackMinimum(level) : 1,gear:{},progression:{}}};
            (item.equipmentInstances ??= []).push(instance);value = instance.id;
        } else if (!this.copy(value) || this.assignedTo(value)) {this.error = 'That copy is already equipped. Unequip it before reassigning it.';return;}
        ids[index] = value;this.reopen();
    }
    changeEquipment(copy:EquipmentCopy,track:ProgressionTrackDefinition,change:{target:boolean;value:number}):void {
        const state = change.target ? copy.instance.target ??= structuredClone(copy.instance.current) : copy.instance.current;
        setCharacterTrack(state,track,change.value);this.reopen();
    }
    applyEquipmentTarget(copy:EquipmentCopy):void {
        if (!copy.instance.target) {return;}
        const proposed = {...copy.instance,current:structuredClone(copy.instance.target)};
        if (equipmentInstanceIssues(copy.item,proposed).length) {this.error = 'The equipment target does not satisfy its configured prerequisites.';return;}
        copy.instance.current = proposed.current;this.message = 'Equipment current progression updated in this draft. Save to keep it.';
    }
    sets():{id:string;pieces:number;description:string}[] {
        const equipped = new Set(Object.values(this.build.gear).flat());
        const sets = new Map<string,{count:number;bonuses:NonNullable<NonNullable<Entry['equipmentDefinition']>['setBonuses']>}>();
        for(const copy of this.copies().filter(copy => equipped.has(copy.instance.id))) {
            const definition = copy.item.equipmentDefinition;
            if (!definition?.setId) {continue;}
            const group = sets.get(definition.setId) ?? {count:0,bonuses:[]};
            group.count++;
            for (const bonus of definition.setBonuses ?? []) {if(!group.bonuses.some(existing => existing.pieces === bonus.pieces && existing.description === bonus.description)){group.bonuses.push(bonus);}}
            sets.set(definition.setId,group);
        }
        return [...sets].flatMap(([id,group]) => group.bonuses.filter(bonus => group.count >= bonus.pieces).map(bonus => ({id,...bonus})));
    }
    materialPlan() {
        const rules = this.rules();
        const result = rules ? characterMaterialCosts(this.definition(),this.build,rules) : {costs:new Map<string,number>(),issues:['Game progression rules are unavailable.']};
        for(const copy of this.copies().filter(copy => Object.values(this.build.gear).flat().includes(copy.instance.id) && copy.instance.target)) {
            const tracks = copy.item.equipmentDefinition?.progressionTracks ?? [];
            if (!tracks.length) {result.issues.push(`${copy.item.name}: upgrade rules unavailable.`);continue;}
            const costs = progressionMaterialCosts(tracks,copy.instance.current,copy.instance.target!);
            costs.costs.forEach((amount,id) => result.costs.set(id,(result.costs.get(id) ?? 0) + amount));result.issues.push(...costs.issues.map(issue => `${copy.item.name}: ${issue}`));
        }
        for(const id of result.costs.keys()){if(!this.inventory.some(item => item.id === id)){result.issues.push(`Required material ${id} is missing from the inventory catalog.`);}}
        return {issues:result.issues,materials:this.inventory.filter(item => result.costs.has(item.id)).map(item => ({item,required:result.costs.get(item.id)!,owned:item.quantity,missing:Math.max(0,result.costs.get(item.id)! - item.quantity),characters:[this.entry().id],plans:[]}))};
    }
    async save():Promise<void> {
        if(this.busy()){return;}this.error = '';this.message = '';
        const rules = this.rules();
        if (!validCharacterCollection(this.build) || (rules && !characterCollectionFits(this.build,rules,this.definition(),this.entry().characterCollection))) {
            const issues = rules ? characterProgressIssues(this.build,rules,this.definition()) : [];
            this.error = issues.length ? issues.map(issue => `${this.tracks().find(track => track.id === issue.trackId)?.label ?? issue.trackId}: ${issue.message}`).join(' ') : 'Check current and target values against level, promotion, skill and equipment limits. Targets cannot be below current progression.';return;
        }
        this.saving = true;
        try {
            const changed = this.inventory.filter(item => JSON.stringify(item.equipmentInstances ?? []) !== this.inventoryBaseline.get(item.id));
            if (changed.some(item => JSON.stringify(this.entries().find(current => current.game === item.game && current.id === item.id)?.equipmentInstances ?? []) !== this.inventoryBaseline.get(item.id))) {this.error = 'Equipment inventory changed in another session. Close and reopen this character before applying equipment edits.';return;}
            const saved = changed.length ? await this.store.saveCharacterDetails(this.entry().id,structuredClone(this.build),changed) : await this.store.saveCharacterCollection(this.entry().id,structuredClone(this.build));
            if(saved){this.baseline = this.snapshot();this.inventoryBaseline = new Map(this.inventory.map(item => [item.id,JSON.stringify(item.equipmentInstances ?? [])]));this.message = 'Character progression and planning saved.';}else{this.error = this.store.error() || 'Could not save. Your draft is preserved; retry after resolving the conflict.';}
        } catch(error) {this.error = error instanceof Error ? error.message : 'Could not save. Your draft is preserved.';} finally{this.saving = false;}
    }
    readonly validGuide = guideUrl;
}
