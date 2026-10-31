import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Inventory } from "./inventory";
import { WorkspaceStore, Entry } from "../../../../../core/state/workspace.store";
import { inventoryItems, readyPlans } from "../../models/inventory-model";

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
        return { fixture, store, root: fixture.nativeElement as HTMLElement };
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
    it('quick-edit controls save quantities without opening the item dialog', async () => {
        const { fixture, store, root } = await setup();
        fixture.componentInstance.quickEdit.set(true);
        fixture.detectChanges();
        root.querySelector<HTMLButtonElement>('[aria-label="Add one Guide to Freedom"]')!.click();
        await fixture.whenStable();
        expect(store.saveInventoryQuantities).toHaveBeenCalledWith('genshin', { book: 25 });
        expect(fixture.componentInstance.selected()).toBeUndefined();
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
