import { Component, computed, effect, inject, input, output, signal, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {NgTemplateOutlet} from '@angular/common';
import { WorkspaceStore, Entry } from "../../../../../core/state/workspace.store";
import { DialogFocusDirective } from "../../../../../shared/directives/dialog-focus/dialog-focus";
import { guideUrl } from "../../../../../../../../common/characters/characters";
import { storyImageUrl } from "../../../../../../../../common/quests/story-template";
import { characterCosts, hasCharacterGoal } from "../../../../../../../../common/farming/farming";
import { inventoryItems, InventoryItemView, readyPlans, requirementStatus } from "../../models/inventory-model";
import {GameRulesEditor} from '../../../characters/components/game-rules-editor/game-rules-editor';
import type {CharacterRules} from '@lib/types/character.type';
import type {CraftRequest} from '@lib/types/inventory.type';
import {craftInventory, craftableBatches} from '@common/inventory/inventory-crafting';
import {inventoryRequirementIssues} from '@common/inventory/inventory-requirements';
import {parseInventoryCounts} from '../../models/inventory-counts';

@Component({
    selector: 'gg-inventory',
    imports: [FormsModule, DialogFocusDirective, GameRulesEditor, NgTemplateOutlet],
    templateUrl: "./inventory.html",
    styleUrls: ["./inventory.scss", './inventory-materials.scss', './inventory-cards.scss', './inventory-header.scss'],
    host: {'(document:click)':'dismissSettings($event)'},
})
export class Inventory {
    readonly game = input.required<string>();
    readonly edit = output<Entry>();
    readonly add = output<void>();
    readonly remove = output<Entry>();
    readonly store = inject(WorkspaceStore);
    private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
    readonly rules = computed(() => this.store.characterRules?.()[this.game()]);
    readonly requirementIssues = computed(() => inventoryRequirementIssues(this.store.entries(),this.game(),this.rules()));
    readonly config = computed(() => this.rules()?.inventory ?? {categories:[],rarities:[],recipes:[]});
    readonly gameName = computed(() => this.store.games?.().find(game => game.id === this.game())?.name ?? this.game());
    readonly accent = computed(() => this.store.games?.().find(game => game.id === this.game())?.color ?? 'var(--color-primary)');
    readonly editMode = signal(false);
    readonly settingsOpen = signal(false);
    readonly countDialog = signal<'import'|'reset'|null>(null);
    readonly importText = signal('');
    readonly importPreview = computed(() => {
        try {return {changes:parseInventoryCounts(this.importText(),this.store.entries(),this.game()),error:''};}
        catch(error){return {changes:{} as Record<string,number>,error:error instanceof Error ? error.message : 'Invalid counts.'};}
    });
    readonly importRows = computed(() => Object.entries(this.importPreview().changes).map(([id,quantity])=>({id,quantity,name:this.items().find(view=>view.item.id===id)?.item.name ?? id})));
    readonly closedGroups = signal(new Set<string>());
    readonly drafts = signal<Record<string,string>>({});
    readonly optimistic = signal<Record<string,number>>({});
    readonly hasPendingQuantities = computed(() => Object.keys(this.optimistic()).length > 0);
    readonly ruleDraft = signal<CharacterRules|null>(null);
    readonly ruleSection = signal<'categories' | 'recipes'>('categories');
    readonly status = requirementStatus;
    readonly craftItem = signal('');
    readonly recipeId = signal('');
    readonly batches = signal<number|null>(1);
    readonly chained = signal(false);
    readonly choices = signal<Record<string,string>>({});
    readonly craftRequest = computed<CraftRequest>(() => ({recipeId:this.recipeId(),quantity:this.batches() ?? 0,chained:this.chained(),recipeChoices:this.choices()}));
    readonly reserved = computed(() => new Map(this.items().map(view => [view.item.id,view.required])));
    readonly craftingOptions = computed(() => this.config().recipes.filter(recipe => recipe.outputItemId === this.craftItem() && recipe.enabled));
    readonly recipeCosts = computed(() => {
        const recipe = this.config().recipes.find(recipe => recipe.id === this.recipeId());
        const amounts = new Map<string,number>();
        for (const cost of [...recipe?.ingredients ?? [],...recipe?.currencyCosts ?? []]) {amounts.set(cost.itemId,(amounts.get(cost.itemId) ?? 0)+cost.quantity*(this.batches() ?? 0));}
        return [...amounts].map(([id,required]) => {const view=this.items().find(view=>view.item.id===id);return {id,name:view?.item.name ?? id,required,owned:view?.owned ?? 0,reserved:view?.required ?? 0};});
    });
    readonly craftPreview = computed(() => {
        if (!this.craftItem()) {return {changes: {} as Record<string,number>,error:''};}
        try {return {changes:craftInventory(this.store.entries(),this.game(),this.config(),this.craftRequest(),this.reserved()),error:''};}
        catch (error) {return {changes:{} as Record<string,number>,error:error instanceof Error ? error.message : 'Invalid crafting request.'};}
    });
    readonly craftable = computed(() => this.craftItem() ? craftableBatches(this.store.entries(),this.game(),this.config(),this.craftRequest(),this.reserved()) : 0);
    readonly changes = computed(() => Object.entries(this.craftPreview().changes).map(([id,quantity]) => ({id,name:this.store.entries().find(item => item.game === this.game() && item.id === id)?.name ?? id,before:this.store.entries().find(item => item.game === this.game() && item.id === id)?.quantity ?? 0,quantity})));
    readonly search = signal('');
    readonly category = signal<string | null>(null);
    readonly rarity = signal('');
    readonly region = signal('');
    readonly ownedOnly = signal(false);
    readonly missingOnly = signal(false);
    readonly coveredOnly = signal(false);
    readonly sort = signal('name');
    readonly detailed = signal(false);
    readonly quickEdit = signal(false);
    readonly filtersOpen = signal(false);
    readonly visibleCount = signal(96);
    readonly failedImages = signal(new Set<string>());
    categoryImage(icon: string): string | null {
        return this.failedImages().has(`category:${icon}`) ? null : storyImageUrl(icon);
    }
    categorySymbol(icon: string): string {
        return icon && icon.length <= 16 && !/[:/\\]/.test(icon) ? icon : '\u25c7';
    }
    categoryImageFailed(icon: string): void {
        this.failedImages.update(images => new Set([...images, `category:${icon}`]));
    }
    readonly selectedId = signal('');
    readonly quantity = signal<number | null>(0);
    readonly error = signal('');
    readonly message = signal('');
    bulk: Record<string, number | null> | null = null;
    readonly items = computed(() => inventoryItems(this.store.entries(), this.game(),this.rules()).map(view => {
        const owned = this.optimistic()[view.item.id] ?? view.owned;
        return {...view,owned,missing:Math.max(0,view.required-owned)};
    }));
    readonly categoryDefinitions = computed(() => {
        const configured = this.config().categories.filter(category => category.enabled || this.editMode()).slice().sort((a,b) => a.displayOrder-b.displayOrder || a.label.localeCompare(b.label));
        const known = new Set(this.config().categories.flatMap(category => [category.id,category.label]));
        const legacy = [...new Set(this.items().map(view => view.item.category || 'Uncategorized'))].filter(value => !known.has(value));
        return [...configured,...legacy.sort().map(id => ({id,label:id,displayOrder:999,enabled:true,icon:'',parentCategoryId:globalThis.undefined}))];
    });
    readonly groups = computed(() => {
        const rows = this.visible();
        const grouped = new Map<string,InventoryItemView[]>();
        for (const view of rows) {const key = this.itemCategories(view)[0] ?? 'Uncategorized'; grouped.set(key,[...grouped.get(key) ?? [],view]);}
        return [...grouped].map(([id,items]) => ({id,label:this.categoryDefinitions().find(category => category.id === id)?.label ?? id,items})).sort((a,b) => (this.categoryDefinitions().findIndex(category => category.id === a.id) - this.categoryDefinitions().findIndex(category => category.id === b.id)));
    });
    readonly summary = computed(() => ({total:this.filtered().length,sufficient:this.filtered().filter(view => this.status(view.owned,view.required) === 'sufficient').length,partial:this.filtered().filter(view => this.status(view.owned,view.required) === 'partial').length,missing:this.filtered().filter(view => this.status(view.owned,view.required) === 'missing').length}));
    readonly categories = computed(() =>
        [...new Set(this.items().map((view) => view.item.category))].sort((a, b) =>
            a.localeCompare(b),
        ),
    );
    readonly regions = computed(() =>
        [
            ...new Set(
                this.items()
                    .map((view) => view.item.region)
                    .filter((value): value is string => !!value),
            ),
        ].sort(),
    );
    readonly rarities = computed(() =>
        [...new Set(this.items().map((view) => view.item.rarity))].sort((a, b) => b - a),
    );
    readonly ownedCount = computed(() => this.items().filter((view) => view.owned > 0).length);
    readonly neededCount = computed(() => this.items().filter((view) => view.required > 0).length);
    readonly incompleteCharacters = computed(() => this.store.entries().filter(entry => entry.game === this.game() && entry.kind === 'characters' && entry.characterCollection?.owned && hasCharacterGoal(entry.characterCollection) && characterCosts(entry.characterDefinition, entry.characterCollection).issues.length).length);
    readonly readyCount = computed(() => readyPlans(this.store.entries(), this.game()));
    readonly filtered = computed(() =>
        this.items()
            .filter((view) => {
                const item = view.item;
                return (
                    [item.name, item.category, item.region ?? '',item.notes,item.description ?? '',...item.inventoryMetadata?.aliases ?? [],...item.inventoryMetadata?.tags ?? []]
                        .join(' ')
                        .toLowerCase()
                        .includes(this.search().trim().toLowerCase()) &&
                    (this.category() === null || this.matchesCategory(view,this.category()!)) &&
                    (item.inventoryMetadata?.enabled !== false || this.editMode()) &&
                    (this.editMode() || this.itemCategories(view).some(id => this.config().categories.find(category => category.id === id)?.enabled !== false)) &&
                    (!this.rarity() || item.rarity === Number(this.rarity())) &&
                    (!this.region() || item.region === this.region()) &&
                    (!this.ownedOnly() || view.owned > 0) &&
                    (!this.missingOnly() || view.missing > 0) &&
                    (!this.coveredOnly() || (view.required > 0 && view.missing === 0))
                );
            })
            .sort((a, b) => {
                const sort = this.sort();
                const difference =
                    sort === 'quantity'
                        ? b.owned - a.owned
                        : sort === 'rarity'
                          ? b.item.rarity - a.item.rarity
                          : sort === 'missing'
                            ? b.missing - a.missing
                            : 0;
                return difference || a.item.name.localeCompare(b.item.name);
            }),
    );
    readonly visible = computed(() => this.filtered().slice(0, this.visibleCount()));
    readonly selected = computed(() =>
        this.items().find((view) => view.item.id === this.selectedId()),
    );
    bulkItems(): InventoryItemView[] {
        return this.bulk
            ? this.items().filter((view) => Object.hasOwn(this.bulk!, view.item.id))
            : [];
    }
    readonly busy = computed(
        () => this.store.saving() || this.store.loading() || !this.store.initialized(),
    );
    readonly compactNumber = new Intl.NumberFormat([], {
        notation: 'compact',
        maximumFractionDigits: 1,
    });
    readonly fullNumber = new Intl.NumberFormat();
    constructor() {
        effect(() => {
            this.game();
            this.selectedId.set('');
            this.bulk = null;
            this.category.set(null);
            this.search.set('');
            this.rarity.set('');
            this.region.set('');
            this.error.set('');
            this.message.set('');
            this.failedImages.set(new Set());
            this.closedGroups.set(new Set()); this.editMode.set(false); this.optimistic.set({}); this.drafts.set({}); this.craftItem.set('');
            this.countDialog.set(null);this.importText.set('');
        });
        effect(() => {
            this.search();
            this.category();
            this.rarity();
            this.region();
            this.ownedOnly();
            this.missingOnly();
            this.coveredOnly();
            this.sort();
            this.visibleCount.set(96);
        });
    }
    itemCategories(view: InventoryItemView): string[] {
        const assigned = view.item.inventoryMetadata?.categoryIds;
        if (assigned?.length) {return assigned;}
        return [this.config().categories.find(category => category.label === view.item.category || category.id === view.item.category)?.id ?? (view.item.category || 'Uncategorized')];
    }
    dismissSettings(event:Event):void {
        const menu=this.hostElement.nativeElement.querySelector<HTMLDetailsElement>('.inventory-settings');
        if(menu && event.target instanceof Node && !menu.contains(event.target)){menu.open=false;}
    }
    openCounts(mode:'import'|'reset'):void {this.error.set('');this.importText.set('');this.countDialog.set(mode);}
    closeCounts():void {if(!this.busy()){this.countDialog.set(null);}}
    async readCountsFile(event:Event):Promise<void> {
        const input=event.target as HTMLInputElement, file=input.files?.[0];input.value='';
        if(!file){return;}
        if(file.size>1000000){this.error.set('Choose a counts file up to 1 MB.');return;}
        try {this.importText.set(await file.text());this.error.set('');} catch {this.error.set('Could not read this file. Paste the counts or choose another file.');}
    }
    async importCounts():Promise<void> {
        if(this.busy() || this.importPreview().error){return;}
        if(await this.persist(this.importPreview().changes)){this.countDialog.set(null);}
    }
    async resetInventory():Promise<void> {
        if(this.busy()){return;}
        if(this.items().some(view=>(view.item.equipmentInstances?.length ?? 0)>0)){this.error.set('Remove owned equipment copies and their assignments before resetting all inventory counts. No counts were changed.');return;}
        const changes=Object.fromEntries(this.items().map(view=>[view.item.id,0]));
        if(!Object.keys(changes).length || await this.persist(changes)){this.drafts.set({});this.countDialog.set(null);}
    }
    matchesCategory(view: InventoryItemView, selected: string): boolean {
        return this.itemCategories(view).some(id => {
            const seen = new Set<string>(); let current: string|undefined = id;
            while (current && !seen.has(current)) {if (current === selected) {return true;} seen.add(current);const currentId: string = current; current = this.categoryDefinitions().find(category => category.id === currentId)?.parentCategoryId;}
            return false;
        });
    }
    toggleGroup(id:string):void {this.closedGroups.update(values => {const next = new Set(values); if (next.has(id)) {next.delete(id);} else {next.add(id);} return next;});}
    rarityColor(item:Entry):string {return this.config().rarities.find(value => value.rarity === item.rarity)?.color ?? 'var(--color-bg-secondary)';}
    draftValue(view:InventoryItemView):string {return this.drafts()[view.item.id] ?? String(view.owned);}
    updateDraft(id:string,value:string):void {this.drafts.update(values => ({...values,[id]:value}));}
    async commitQuantity(view:InventoryItemView):Promise<void> {
        const raw = this.drafts()[view.item.id]; if (raw === globalThis.undefined || this.busy()) {return;}
        const quantity = raw.trim() ? Number(raw) : NaN;
        if (!/^\d+$/.test(raw.trim()) || !this.validQuantity(view.item,quantity)) {this.error.set(`Enter a nonnegative whole quantity for ${view.item.name} within its stack limit.`);return;}
        if (quantity === view.owned && this.optimistic()[view.item.id] === globalThis.undefined) {return;}
        if (await this.persist({[view.item.id]:quantity})) {this.drafts.update(values => {const next = {...values}; Reflect.deleteProperty(next,view.item.id);return next;});}
    }
    async retryQuantities():Promise<void> {await this.persist(this.optimistic());}
    hasRecipes(id:string):boolean {return this.config().recipes.some(recipe => recipe.enabled && recipe.outputItemId === id);}
    openCraft(id:string):void {this.error.set('');this.craftItem.set(id);const recipes=this.config().recipes.filter(recipe=>recipe.enabled && recipe.outputItemId===id);this.recipeId.set(recipes.length===1 ? recipes[0].id : '');this.batches.set(1);this.chained.set(false);this.choices.set({});}
    setChoice(item:string,value:string):void {this.choices.update(values => ({...values,[item]:value}));}
    async confirmCraft():Promise<void> {if (this.busy() || this.craftPreview().error) {return;} if (await this.store.craftInventory(this.game(),this.craftRequest())) {this.craftItem.set('');} else {this.error.set(this.store.error());}}
    editRules(section: 'categories' | 'recipes' = 'categories'):void {
        const rules = this.rules();
        if (this.store.canEdit() && rules) {
            this.ruleSection.set(section);
            this.ruleDraft.set(structuredClone(rules));
        }
    }
    async saveRules():Promise<void> {const rules = this.ruleDraft();if (rules && await this.store.saveCharacterRules(this.game(),rules)) {this.ruleDraft.set(null);} else {this.error.set(this.store.error());}}
    resetFilters(): void {
        this.category.set(null);
        this.search.set('');
        this.rarity.set('');
        this.region.set('');
        this.ownedOnly.set(false);
        this.missingOnly.set(false);
        this.coveredOnly.set(false);
    }
    image(item: Entry): string | null {
        if (!item.icon || this.failedImages().has(`${item.id}:${item.icon}`)) {return null;}
        if (/^\/?(icons|images|assets)\/[\w/.,% -]+$/i.test(item.icon))
            {return '/' + item.icon.replace(/^\//, '');}
        return storyImageUrl(item.icon);
    }
    imageFailed(item: Entry): void {
        this.failedImages.update((ids) => new Set([...ids, `${item.id}:${item.icon}`]));
    }
    limit(item: Entry): number {
        return item.maxStack ?? 1e9;
    }
    validQuantity(item: Entry, value: number | null): boolean {
        return (
            typeof value === 'number' &&
            Number.isSafeInteger(value) &&
            value >= 0 &&
            value <= this.limit(item)
        );
    }
    label(view: InventoryItemView): string {
        return `${view.item.name} · ${view.item.rarity} stars · Owned ${view.owned}${
            view.required ? ` · Required ${view.required} · Missing ${view.missing}` : ''
        }`;
    }
    open(view: InventoryItemView): void {
        this.selectedId.set(view.item.id);
        this.quantity.set(view.owned);
        this.error.set('');
        this.message.set('');
    }
    close(): void {
        if (!this.busy()) {
            this.selectedId.set('');
            this.bulk = null;
            this.error.set('');
        }
    }
    adjustDraft(delta: number): void {
        const item = this.selected()?.item;
        if (item)
            {this.quantity.set(
                Math.min(this.limit(item), Math.max(0, (this.quantity() ?? 0) + delta)),
            );}
    }
    async save(): Promise<void> {
        const item = this.selected()?.item,
            quantity = this.quantity();
        if (!item || this.busy()) {return;}
        if (!this.validQuantity(item, quantity)) {
            this.error.set('Enter a whole quantity within the item’s stack limit.');
            return;
        }
        await this.persist({ [item.id]: quantity as number });
    }
    async quickAdjust(view: InventoryItemView, delta: number): Promise<void> {
        if (!this.busy())
            {await this.persist({
                [view.item.id]: Math.min(this.limit(view.item), Math.max(0, view.owned + delta)),
            });}
    }
    startBulk(): void {
        this.bulk = Object.fromEntries(this.visible().map((view) => [view.item.id, view.owned]));
        this.error.set('');
    }
    async saveBulk(): Promise<void> {
        if (!this.bulk || this.busy()) {return;}
        const changes: Record<string, number> = {};
        for (const view of this.bulkItems()) {
            const quantity = this.bulk[view.item.id];
            if (!this.validQuantity(view.item, quantity)) {
                this.error.set(
                    `Enter a whole quantity for ${view.item.name} within its stack limit.`,
                );
                return;
            }
            if (quantity !== view.owned) {changes[view.item.id] = quantity as number;}
        }
        if (!Object.keys(changes).length) {
            this.close();
            return;
        }
        if (await this.persist(changes)) {this.bulk = null;}
    }
    private async persist(changes: Record<string, number>): Promise<boolean> {
        this.error.set('');
        this.message.set('');
        this.optimistic.update(values => ({...values,...changes}));
        if (await this.store.saveInventoryQuantities(this.game(), changes)) {
            this.optimistic.update(values => {const next = {...values};Object.keys(changes).forEach(id => {Reflect.deleteProperty(next,id);});return next;});
            return true;
        }
        this.error.set(
            this.store.error() || 'Could not save inventory. Your changes are still open.',
        );
        return false;
    }
    wiki(item: Entry): string | null {
        return item.wikiUrl && guideUrl(item.wikiUrl) ? item.wikiUrl : null;
    }
}
