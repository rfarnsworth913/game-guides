import {Component,input} from '@angular/core';
import {FormsModule} from '@angular/forms';
import type {CharacterDefinition,CharacterRules} from '@lib/types/character.type';
import type {CharacterResource} from '@lib/types/character-extension.type';
import type {Entry} from '@lib/types/workspace.type';

/** Shared editor fields; opened after leaving Character Details, never as a nested modal. */
@Component({selector:'gg-character-catalog-fields',imports:[FormsModule],templateUrl:'./character-catalog-fields.html',styles:[`
    :host{display:block}fieldset{margin:18px 0;padding:16px;border:1px solid var(--color-border);border-radius:9px}legend{font-size:13px}.catalog-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.catalog-fields label,.resource-fields label{display:grid;gap:8px;margin:0;font-size:12px;min-width:0}input,select,textarea{max-width:100%;box-sizing:border-box;width:100%;margin:0;min-height:42px}details{border:1px solid var(--color-border);border-radius:8px;margin:12px 0}summary{padding:12px;cursor:pointer;font-size:13px}.resource-fields{display:grid;gap:14px;padding:14px}p{font-size:12px;color:var(--color-text-secondary)}@media(max-width:600px){.catalog-fields{grid-template-columns:minmax(0,1fr)}}
`]})
export class CharacterCatalogFields {
    readonly section = input<'all' | 'attributes' | 'resources'>('all');
    readonly definition = input.required<CharacterDefinition>();
    readonly rules = input<CharacterRules>();
    readonly game = input.required<string>();
    readonly entries = input<Entry[]>([]);
    readonly standalone = {standalone:true};
    attributes() {return (this.rules()?.attributes ?? []).filter(attribute => !['rarity','weaponType','damageType','roles'].includes(attribute.id)).slice().sort((a,b) => a.displayOrder - b.displayOrder);}
    value(id:string) {return this.definition().attributes?.[id] ?? null;}
    setAttribute(id:string,value:string|number|boolean|string[]|null):void {
        const attributes = this.definition().attributes ??= {};
        if(value === null || value === '' || Array.isArray(value) && !value.length){Reflect.deleteProperty(attributes,id);}else{attributes[id] = value;}
    }
    setProfile(id:string):void {if(id){this.definition().progressionProfileId = id;}else{delete this.definition().progressionProfileId;}}
    addResource():void {(this.definition().resources ??= []).push({id:`resource-${crypto.randomUUID()}`,category:'build-guides',title:'',sourceType:'external',url:'',sortOrder:this.definition().resources?.length ?? 0});}
    setSource(resource:CharacterResource,type:'internal'|'external'):void {
        resource.sourceType = type;if(type === 'external'){delete resource.contentId;resource.url = '';}else{delete resource.url;resource.contentId = '';}
    }
    cleanCreator(resource:CharacterResource):void {if(!resource.creator?.trim()){delete resource.creator;}}
    related() {return this.entries().filter(entry => entry.game === this.game() && entry.kind === 'story');}
}
