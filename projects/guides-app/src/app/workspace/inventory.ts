import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WorkspaceStore, Entry } from './workspace.store';
import { DialogFocusDirective } from './dialog-focus';
import { guideUrl } from '../../../../common/characters';
import { inventoryItems, InventoryItemView, readyPlans } from './inventory-model';

@Component({
    selector: 'gg-inventory',
    imports: [FormsModule, DialogFocusDirective],
    templateUrl: './inventory.html',
    styleUrl: './inventory.scss',
})
export class Inventory {
    readonly game = input.required<string>();
    readonly edit = output<Entry>();
    readonly remove = output<Entry>();
    readonly store = inject(WorkspaceStore);
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
    readonly selectedId = signal('');
    readonly quantity = signal<number | null>(0);
    readonly error = signal('');
    readonly message = signal('');
    bulk: Record<string, number | null> | null = null;
    readonly items = computed(() => inventoryItems(this.store.entries(), this.game()));
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
    readonly readyCount = computed(() => readyPlans(this.store.entries(), this.game()));
    readonly filtered = computed(() =>
        this.items()
            .filter((view) => {
                const item = view.item;
                return (
                    [item.name, item.category, item.region ?? '']
                        .join(' ')
                        .toLowerCase()
                        .includes(this.search().trim().toLowerCase()) &&
                    (this.category() === null || item.category === this.category()) &&
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
        return guideUrl(item.icon) ? item.icon : null;
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
        if (await this.store.saveInventoryQuantities(this.game(), changes)) {
            this.message.set('Inventory saved. Plan requirements updated.');
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
