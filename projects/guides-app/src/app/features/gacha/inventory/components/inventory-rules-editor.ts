import {Component,input} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NgTemplateOutlet} from '@angular/common';
import type {CharacterRules} from '@lib/types/character.type';
import type {Entry} from '@lib/types/workspace.type';
import type {InventoryRecipe} from '@lib/types/inventory.type';
import {GameImagePicker} from '../../../../shared/components/image-selector/game-image-picker';
@Component({selector:'gg-inventory-rules-editor',imports:[FormsModule,GameImagePicker,NgTemplateOutlet],templateUrl:'./inventory-rules-editor.html',styleUrls:['./inventory-rules-editor.scss'],styles:[`
    :host{display:block}fieldset{border:1px solid var(--line);border-radius:9px;padding:16px;margin:16px 0}label{display:grid;gap:8px;font-size:12px;margin:12px 0}input,select{width:100%;box-sizing:border-box;min-height:40px}input[type=checkbox]{width:16px;min-height:0}input[type=color]{width:70px}.inventory-rule-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:end}.inventory-rule-row label{margin:0}button{margin:8px 8px 0 0}.inventory-check{display:flex;align-items:center;gap:8px}summary{cursor:pointer;padding:12px;background:var(--surface)}details{border:1px solid var(--line);border-radius:8px;margin:14px 0}details>div{padding:16px}p{font-size:12px;color:var(--muted);line-height:1.6}@media(max-width:650px){.inventory-rule-row{grid-template-columns:1fr}}
`]})
export class InventoryRulesEditor {
    readonly rules = input.required<CharacterRules>();
    readonly entries = input<Entry[]>([]);
    readonly game = input.required<string>();
    readonly section = input<'all' | 'categories' | 'recipes'>('all');
    readonly standalone = {standalone:true};
    draggedCategory: number | null = null;
    moveCategory(from: number, to: number): void {
        const categories = this.config().categories;
        if (from < 0 || to < 0 || from >= categories.length || to >= categories.length || from === to) { return; }
        const [category] = categories.splice(from, 1);
        categories.splice(to, 0, category);
        categories.forEach((item, index) => { item.displayOrder = index; });
    }
    dropCategory(event: DragEvent, index: number): void {
        event.preventDefault();
        if (this.draggedCategory !== null) { this.moveCategory(this.draggedCategory, index); }
        this.draggedCategory = null;
    }
    categoryKey(event: KeyboardEvent, index: number): void {
        if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            this.moveCategory(index, index + (event.key === 'ArrowUp' ? -1 : 1));
        }
    }
    config() {this.rules().inventory ??= {categories:[],rarities:[],recipes:[]};return this.rules().inventory!;}
    materials() {return this.entries().filter(entry => entry.game === this.game() && entry.kind === 'inventory' && !entry.equipmentDefinition);}
    addCategory():void {this.config().categories.push({id:crypto.randomUUID(),label:'',displayOrder:this.config().categories.length,enabled:true});}
    addRecipe():void {this.config().recipes.push({id:crypto.randomUUID(),outputItemId:'',outputQuantity:1,ingredients:[{itemId:'',quantity:1}],enabled:true});}
    setUnlocks(recipe:InventoryRecipe,value:string):void {recipe.unlockContentIds = value.split(',').map(value => value.trim()).filter(Boolean);}
    setParent(index:number,value:string):void {const category=this.config().categories[index];if(value){category.parentCategoryId=value;}else{delete category.parentCategoryId;}}
}
