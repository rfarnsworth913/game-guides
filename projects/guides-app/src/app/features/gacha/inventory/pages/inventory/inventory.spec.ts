import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Inventory } from "./inventory";
import { WorkspaceStore, Entry } from "../../../../../core/state/workspace.store";
import { inventoryItems, readyPlans } from "../../models/inventory-model";
import type {CharacterRules} from '@lib/types/character.type';

const item: Entry = {
    id: 'book',
    game: 'genshin',
    kind: 'inventory',
    name: 'Guide to Freedom',
    notes: '',
    quantity: 24,
    target: 0,
    category: 'Talent',
    rarity: 3,
    region: 'Mondstadt',
    maxStack: 9999,
    members: [],
    requirements: [],
    completed: false,
    order: 0,
    day: '',
};
const plan: Entry = {
    ...item,
    id: 'plan',
    name: 'Talent upgrades',
    kind: 'plans',
    requirements: [{ item: 'book', amount: 40 }],
};
delete plan.region;
delete plan.maxStack;

describe('Inventory requirements', () => {
    it('aggregates actual active plans, excludes completed/other-game plans, and uses one inventory quantity', () => {
        const entries = [
            item,
            plan,
            { ...plan, id: 'plan2', requirements: [{ item: 'book', amount: 23 }] },
            { ...plan, id: 'complete', completed: true },
            { ...plan, id: 'other', game: 'hsr' },
        ];
        const [view] = inventoryItems(entries, 'genshin');
        expect(view).toMatchObject({ owned: 24, required: 63, missing: 39 });
        expect(view.usages).toHaveLength(2);
        expect(readyPlans(entries, 'genshin')).toBe(1);
        expect(
            inventoryItems([{ ...item, quantity: 100 }, ...entries.slice(1)], 'genshin')[0].missing,
        ).toBe(0);
        expect(
            readyPlans(
                [
                    item,
                    {
                        ...plan,
                        requirements: [
                            { item: 'book', amount: 20 },
                            { item: 'book', amount: 20 },
                        ],
                    },
                ],
                'genshin',
            ),
        ).toBe(0);
    });
});

describe('Inventory interface', () => {
    async function setup() {
        const entries = signal<Entry[]>([
            item,
            plan,
            { ...item, id: 'gem', name: 'Gemstone', category: 'Gemstone', quantity: 0, rarity: 5 },
            { ...item, id: 'other', game: 'hsr' },
        ]);
        const saveInventoryQuantities = vi.fn(
            async (game: string, changes: Record<string, number>) => {
                entries.update((values) =>
                    values.map((entry) =>
                        entry.game === game &&
                        entry.kind === 'inventory' &&
                        Object.hasOwn(changes, entry.id)
                            ? { ...entry, quantity: changes[entry.id] }
                            : entry,
                    ),
                );
                return true;
            },
        );
        const store = {
            characterRules: signal<Record<string,CharacterRules>>({}),
            entries,
            saveInventoryQuantities,
            initialized: signal(true),
            loading: signal(false),
            saving: signal(false),
            canEdit: signal(false),
            error: signal('Save failed'),
        };
        TestBed.configureTestingModule({
            providers: [{ provide: WorkspaceStore, useValue: store }],
        });
        const fixture = TestBed.createComponent(Inventory);
        fixture.componentRef.setInput('game', 'genshin');
        fixture.detectChanges();
        await fixture.whenStable();
        return { fixture, store, root: (fixture.nativeElement as HTMLElement) as HTMLElement };
    }
    it('defaults to a compact game-scoped grid and filters by category, region, rarity, and missing plans', async () => {
        const { fixture, root } = await setup();
        const component = fixture.componentInstance;
        expect(component.detailed()).toBe(false);
        expect(root.querySelectorAll('.inventory-tile')).toHaveLength(2);
        component.category.set('Talent');
        fixture.detectChanges();
        expect(root.querySelectorAll('.inventory-tile')).toHaveLength(1);
        component.category.set(null);
        component.rarity.set('5');
        fixture.detectChanges();
        expect(root.querySelector('.inventory-tile')?.textContent).toContain('Gemstone');
        component.rarity.set('');
        component.missingOnly.set(true);
        fixture.detectChanges();
        expect(root.querySelector('.inventory-tile')?.textContent).toContain('Freedom');
        component.region.set('Liyue');
        fixture.detectChanges();
        expect(root.textContent).toContain('No matching materials');
        component.resetFilters();
        component.detailed.set(true);
        fixture.detectChanges();
        expect(root.querySelector('.inventory-grid.detailed')).not.toBeNull();
    });
    it('opens editor-only category definitions separately from recipes without mutating saved rules', async () => {
        const {fixture, store, root} = await setup();
        const rules: CharacterRules = {levelCap: 90, rarities: [5], weaponTypes: [], damageTypes: [], roles: [], equipmentSlots: [], progressionTracks: []};
        store.characterRules.set({genshin: rules});
        fixture.detectChanges();
        expect(root.querySelector('.inventory-settings-menu')?.textContent).not.toContain('Material Categories');
        store.canEdit.set(true); fixture.detectChanges();
        const categoryButton = [...root.querySelectorAll<HTMLButtonElement>('.inventory-settings-menu button')].find(button => button.textContent === 'Material Categories')!;
        categoryButton.click(); fixture.detectChanges(); await fixture.whenStable();
        expect(root.querySelector('#rules-title')?.textContent).toBe('Material Categories');
        expect(root.querySelector('gg-game-rules-editor .section-editor-sidebar')).toBeNull();
        expect(fixture.componentInstance.ruleDraft()).not.toBe(rules);
        expect(rules.inventory).toBeUndefined();
        fixture.componentInstance.ruleDraft.set(null); fixture.detectChanges();
        const recipesButton = [...root.querySelectorAll<HTMLButtonElement>('.inventory-settings-menu button')].find(button => button.textContent === 'Crafting & Conversion Recipes')!;
        recipesButton.click(); fixture.detectChanges(); await fixture.whenStable();
        expect(root.querySelector('#rules-title')?.textContent).toBe('Crafting & Conversion Recipes');
        expect(root.querySelector('.material-categories')).toBeNull();
    });
    it('renders category image URLs as icons, preserves symbols and falls back when an image fails', async () => {
        const {fixture, store, root} = await setup();
        const uploaded = '/api/games/genshin/images/credits-123.webp';
        const remote = 'https://example.com/experience.png';
        store.characterRules.set({genshin: {
            levelCap: 90, rarities: [5], weaponTypes: [], damageTypes: [], roles: [], equipmentSlots: [], progressionTracks: [],
            inventory: {categories: [
                {id: 'currency', label: 'Credits', icon: uploaded, displayOrder: 0, enabled: true},
                {id: 'exp', label: 'Experience', icon: remote, displayOrder: 1, enabled: true},
                {id: 'skill', label: 'Skills', icon: '★', displayOrder: 2, enabled: true},
                {id: 'invalid', label: 'Invalid', icon: 'data:text/html,invalid', displayOrder: 3, enabled: true},
            ], rarities: [], recipes: []},
        }});
        fixture.detectChanges();
        const nav = root.querySelector<HTMLElement>('.inventory-categories')!;
        const images = nav.querySelectorAll<HTMLImageElement>('img');
        expect([...images].map(image => image.getAttribute('src'))).toEqual([uploaded, remote]);
        expect(nav.textContent).not.toContain('/api/games/');
        expect(nav.textContent).not.toContain('https://');
        expect(nav.textContent).not.toContain('data:text/html');
        expect(nav.textContent).toContain('★');
        images[0].dispatchEvent(new Event('error'));
        fixture.detectChanges();
        expect(nav.querySelectorAll('img')).toHaveLength(1);
        const credits = [...nav.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('Credits'))!;
        expect(credits.querySelector('.inventory-category-icon')?.textContent?.trim()).toBe('◇');
        credits.click();
        expect(fixture.componentInstance.category()).toBe('currency');
    });
    it('quick-edit controls save quantities without opening the item dialog', async () => {
        const { fixture, store, root } = await setup();
        fixture.componentInstance.quickEdit.set(true);
        fixture.detectChanges();
        root.querySelector<HTMLButtonElement>('[aria-label="Add one Guide to Freedom"]')!.click();
        await fixture.whenStable();
        expect(store.saveInventoryQuantities).toHaveBeenCalledWith('genshin', { book: 25 });
        expect(fixture.componentInstance.selected()).toBeUndefined();
    });
    it('shows quantity controls in normal mode and protects editor-only catalog actions in Settings', async () => {
        const {fixture,root,store}=await setup();
        expect(root.querySelector('input[aria-label="Guide to Freedom owned quantity"]')).not.toBeNull();
        expect(root.querySelector('.inventory-settings-menu')?.textContent).not.toContain('Edit Mode');
        store.canEdit.set(true);fixture.detectChanges();
        const toggle=root.querySelector<HTMLInputElement>('.inventory-edit-toggle input[type="checkbox"]')!;
        toggle.checked=true;toggle.dispatchEvent(new Event('change'));fixture.detectChanges();
        expect(root.querySelector('.inventory-create-item')?.textContent).toContain('Create Item');
        expect(root.querySelector('.material-catalog-actions')?.textContent).toContain('Edit');
        const menu=root.querySelector<HTMLDetailsElement>('.inventory-settings')!;menu.open=true;
        root.querySelector('.material-page-heading h1')!.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        expect(menu.open).toBe(false);
    });
    it('commits typed quantities only on request, rejects invalid text, and preserves failed optimistic values for retry', async () => {
        const {fixture,store,root}=await setup();const component=fixture.componentInstance;
        const input=root.querySelector<HTMLInputElement>('input[aria-label="Guide to Freedom owned quantity"]')!;
        input.value='35';input.dispatchEvent(new Event('input'));
        expect(store.saveInventoryQuantities).not.toHaveBeenCalled();
        input.dispatchEvent(new Event('blur'));await fixture.whenStable();
        expect(store.saveInventoryQuantities).toHaveBeenCalledWith('genshin',{book:35});
        component.updateDraft('book','');await component.commitQuantity(component.items()[0]);
        expect(store.saveInventoryQuantities).toHaveBeenCalledTimes(1);
        expect(component.error()).toContain('whole quantity');
        component.updateDraft('book','-3');await component.commitQuantity(component.items()[0]);
        expect(store.saveInventoryQuantities).toHaveBeenCalledTimes(1);
        component.updateDraft('book','50');store.saveInventoryQuantities.mockResolvedValueOnce(false);
        await component.commitQuantity(component.items()[0]);
        expect(component.items()[0].owned).toBe(50);expect(component.drafts()['book']).toBe('50');
        expect(component.error()).toBe('Save failed');
        await component.retryQuantities();expect(component.optimistic()).toEqual({});
    });
    it('offers import and reset to players, and gates the header edit toggle and creation to editors in Edit Mode', async () => {
        const {fixture,root,store}=await setup();
        const component=fixture.componentInstance;
        expect(root.querySelector('.inventory-settings-menu')?.textContent).toContain('Import Counts');
        expect(root.querySelector('.inventory-settings-menu')?.textContent).toContain('Reset Inventory');
        expect(root.querySelector('.inventory-create-item')).toBeNull();
        expect(root.querySelector('.inventory-edit-toggle')).toBeNull();
        store.canEdit.set(true);fixture.detectChanges();
        expect(root.querySelector('.inventory-edit-toggle')).not.toBeNull();
        expect(root.querySelector('.inventory-create-item')).toBeNull();
        expect(root.querySelector('.inventory-settings-menu input[role="switch"]')).toBeNull();
        const toggle=root.querySelector<HTMLInputElement>('.inventory-edit-toggle input')!;
        toggle.checked=true;toggle.dispatchEvent(new Event('change'));fixture.detectChanges();
        const add=vi.fn();component.add.subscribe(add);
        root.querySelector<HTMLButtonElement>('.inventory-create-item')!.click();
        expect(add).toHaveBeenCalledOnce();expect(component.editMode()).toBe(true);
        toggle.checked=false;toggle.dispatchEvent(new Event('change'));fixture.detectChanges();
        expect(root.querySelector('.inventory-create-item')).toBeNull();
        component.editMode.set(true);store.canEdit.set(false);fixture.detectChanges();
        expect(root.querySelector('.inventory-edit-toggle')).toBeNull();
        expect(root.querySelector('.inventory-create-item')).toBeNull();
        expect(root.querySelector('.material-catalog-actions')).toBeNull();
    });
    it('previews import counts before applying them and rejects invalid imports without writing', async () => {
        const {fixture,store}=await setup();const component=fixture.componentInstance;
        component.openCounts('import');component.importText.set('{"book": 60}');fixture.detectChanges();
        expect(component.importRows()).toEqual([{id:'book',name:'Guide to Freedom',quantity:60}]);
        expect(store.saveInventoryQuantities).not.toHaveBeenCalled();
        await component.importCounts();
        expect(store.saveInventoryQuantities).toHaveBeenCalledWith('genshin',{book:60});expect(component.countDialog()).toBeNull();
        component.openCounts('import');component.importText.set('{"other": 5}');await component.importCounts();
        expect(component.importPreview().error).toContain('Unknown inventory item');expect(store.saveInventoryQuantities).toHaveBeenCalledTimes(1);
    });
    it('resets all current-game counts only after confirmation, including items hidden by filters', async () => {
        const {fixture,store}=await setup();const component=fixture.componentInstance;
        component.category.set('Gemstone');component.openCounts('reset');
        expect(store.saveInventoryQuantities).not.toHaveBeenCalled();
        component.closeCounts();expect(store.saveInventoryQuantities).not.toHaveBeenCalled();
        component.openCounts('reset');await component.resetInventory();
        expect(store.saveInventoryQuantities).toHaveBeenCalledWith('genshin',{book:0,gem:0});
        expect(component.countDialog()).toBeNull();
        expect(store.entries().find(entry=>entry.id==='other')?.quantity).toBe(24);
    });
    it('counts only positive requirements and preserves independent group collapse through updates and edit mode changes', async () => {
        const {fixture,store}=await setup();const component=fixture.componentInstance;
        expect(component.summary()).toEqual({total:2,sufficient:0,partial:1,missing:0});
        component.toggleGroup('Talent');
        await store.saveInventoryQuantities('genshin',{book:50});
        component.editMode.set(true);fixture.detectChanges();
        expect(component.closedGroups().has('Talent')).toBe(true);
        expect(component.summary()).toEqual({total:2,sufficient:1,partial:0,missing:0});
    });
    it('uses game-defined category descendants, aliases and tags, while hiding disabled categories', async () => {
        const {fixture,store}=await setup();const component=fixture.componentInstance;
        store.characterRules.set({genshin:{levelCap:90,rarities:[3,5],weaponTypes:[],damageTypes:[],roles:[],equipmentSlots:[],progressionTracks:[],inventory:{categories:[{id:'parent',label:'Upgrades',displayOrder:0,enabled:true},{id:'child',label:'Talent',displayOrder:1,enabled:true,parentCategoryId:'parent'},{id:'gems',label:'Gemstone',displayOrder:2,enabled:false}],recipes:[],rarities:[]}}});
        store.entries.update(entries=>entries.map(entry=>entry.id==='book'?{...entry,inventoryMetadata:{aliases:['Liberation'],tags:['growth'],categoryIds:['child'],enabled:true}}:entry));
        component.category.set('parent');component.search.set('Liberation');fixture.detectChanges();
        expect(component.visible().map(view=>view.item.id)).toEqual(['book']);
        component.search.set('growth');expect(component.visible().map(view=>view.item.id)).toEqual(['book']);
        component.resetFilters();expect(component.visible().map(view=>view.item.id)).toEqual(['book']);
        component.editMode.set(true);expect(component.visible()).toHaveLength(2);
    });
    it('saves exact quantities without changing shared catalog fields and updates derived requirements', async () => {
        const { fixture, store } = await setup();
        const component = fixture.componentInstance;
        component.open(component.items()[0]);
        component.quantity.set(30);
        await component.save();
        expect(store.saveInventoryQuantities).toHaveBeenCalledWith('genshin', { book: 30 });
        expect(component.selected()!.missing).toBe(10);
        expect(store.entries()[0].category).toBe('Talent');
        component.quantity.set(-1);
        await component.save();
        expect(store.saveInventoryQuantities).toHaveBeenCalledTimes(1);
        component.quantity.set(1.5);
        await component.save();
        expect(store.saveInventoryQuantities).toHaveBeenCalledTimes(1);
    });
    it('retains failed drafts, respects limits and sends bulk edits together', async () => {
        const { fixture, store } = await setup();
        const component = fixture.componentInstance;
        component.open(component.items()[0]);
        component.quantity.set(55);
        store.saveInventoryQuantities.mockResolvedValueOnce(false);
        await component.save();
        expect(component.quantity()).toBe(55);
        expect(component.error()).toBe('Save failed');
        component.close();
        component.startBulk();
        component.bulk!['book'] = 50;
        component.bulk!['gem'] = 2;
        await component.saveBulk();
        expect(store.saveInventoryQuantities).toHaveBeenLastCalledWith('genshin', {
            book: 50,
            gem: 2,
        });
        expect(component.bulk).toBeNull();
        expect(component.validQuantity(item, 10000)).toBe(false);
    });
    it('renders incrementally and falls back safely when artwork is missing', async () => {
        const { fixture, store, root } = await setup();
        store.entries.set(
            Array.from({ length: 110 }, (_, index) => ({ ...item, id: 'item-' + index })),
        );
        fixture.detectChanges();
        expect(root.querySelectorAll('.inventory-tile')).toHaveLength(96);
        fixture.componentInstance.visibleCount.set(192);
        fixture.detectChanges();
        expect(root.querySelectorAll('.inventory-tile')).toHaveLength(110);
        expect(
            fixture.componentInstance.image({ ...item, icon: 'data:text/html,invalid' }),
        ).toBeNull();
    });
});
