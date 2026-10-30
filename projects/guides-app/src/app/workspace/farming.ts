import { Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { WorkspaceStore, Entry } from './workspace.store';
import { DialogFocusDirective } from './dialog-focus';
import { FarmingMaterialTile } from './farming-material';
import { FarmingDataEditor } from './farming-data-editor';
import {
    FarmingGroup,
    FarmingMaterial,
    farmingGroups,
    farmingRequirements,
    hasCharacterGoal,
    serverDay,
    sourceAvailability,
} from '../../../../common/farming';
import { FarmingSource } from '../../../../common/farming-config';
import { storyImageUrl } from '../../../../common/story-template';
import {
    defaultFarmingPreferences,
    FarmingPreferences,
    validFarmingPreferences,
} from './farming-preferences';

@Component({
    selector: 'gg-farming',
    imports: [
        FormsModule,
        RouterLink,
        DialogFocusDirective,
        FarmingMaterialTile,
        FarmingDataEditor,
    ],
    templateUrl: './farming.html',
    styleUrl: './farming.scss',
})
export class Farming {
    readonly game = input.required<string>();
    readonly store = inject(WorkspaceStore);
    readonly prefs = signal(defaultFarmingPreferences());
    readonly now = signal(Date.now());
    readonly error = signal('');
    readonly message = signal('');
    readonly selectedMaterialId = signal('');
    readonly quantity = signal<number | null>(0);
    readonly filtersOpen = signal(false);
    readonly dataOpen = signal(false);
    readonly validImage = storyImageUrl;
    readonly weekdays = [
        { id: 1, label: 'Mon' },
        { id: 2, label: 'Tue' },
        { id: 3, label: 'Wed' },
        { id: 4, label: 'Thu' },
        { id: 5, label: 'Fri' },
        { id: 6, label: 'Sat' },
        { id: 0, label: 'Sun' },
    ];
    readonly config = computed(
        () => this.store.characterRules()[this.game()]?.farming ?? { sources: [], servers: [] },
    );
    readonly characters = computed(() =>
        this.store
            .entries()
            .filter(
                (entry) =>
                    entry.game === this.game() &&
                    entry.kind === 'characters' &&
                    entry.characterCollection?.owned,
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
    );
    readonly manualMembers = computed(
        () =>
            new Set(
                this.store
                    .entries()
                    .filter(
                        (entry) =>
                            entry.game === this.game() &&
                            entry.kind === 'plans' &&
                            !entry.completed,
                    )
                    .flatMap((entry) => entry.members),
            ),
    );
    readonly selectedCharacters = computed(() =>
        this.characters().filter((entry) =>
            this.prefs().selected === null
                ? hasCharacterGoal(entry.characterCollection) ||
                  (this.prefs().mode === 'plans' && this.manualMembers().has(entry.id))
                : this.prefs().selected!.includes(entry.id),
        ),
    );
    readonly choices = computed(() =>
        this.characters().filter(
            (entry) =>
                this.prefs().includeOther ||
                hasCharacterGoal(entry.characterCollection) ||
                this.selectedCharacters().some((character) => character.id === entry.id) ||
                (this.prefs().mode === 'plans' && this.manualMembers().has(entry.id)),
        ),
    );
    readonly result = computed(() =>
        farmingRequirements(
            this.store.entries(),
            this.game(),
            this.selectedCharacters().map((entry) => entry.id),
            this.prefs().mode,
            this.prefs().includeUnassigned,
        ),
    );
    readonly server = computed(() => {
        const servers = this.config().servers;
        if (servers.length === 1) {return servers[0];}
        return servers.find(server => server.id === this.prefs().server);
    });
    readonly gameDay = computed(() =>
        this.server() ? serverDay(this.now(), this.server()!) : null,
    );
    readonly categories = computed(() =>
        [...new Set(this.config().sources.map((source) => source.category))].sort(),
    );
    readonly regions = computed(() =>
        [
            ...new Set(
                this.config()
                    .sources.map((source) => source.region)
                    .filter(Boolean),
            ),
        ].sort(),
    );
    readonly rarities = computed(() =>
        [...new Set(this.result().materials.map((row) => row.item.rarity))].sort((a, b) => b - a),
    );
    readonly allGroups = computed(() => farmingGroups(this.result().materials, this.config()));
    readonly hasUnknownSources = computed(() => this.allGroups().some((group) => !group.source));
    readonly unknownAvailability = computed(() => this.allGroups().filter(group => !group.source || this.availability(group.source) === 'unknown').length);
    readonly missingCount = computed(
        () => this.result().materials.filter((row) => row.missing > 0).length,
    );
    readonly coveredCount = computed(
        () => this.result().materials.filter((row) => row.missing === 0).length,
    );
    readonly attentionCount = computed(
        () =>
            this.allGroups().filter((group) => group.materials.some((row) => row.missing > 0))
                .length,
    );
    readonly groups = computed(() => {
        const prefs = this.prefs();
        const groups = this.allGroups()
            .filter(
                (group) =>
                    (!prefs.category ||
                        group.source?.category === prefs.category ||
                        (prefs.category === '@unknown' && !group.source)) &&
                    (!prefs.region || group.source?.region === prefs.region) &&
                    (!prefs.availableOnly ||
                        (!!group.source && this.availability(group.source) === 'available')),
            )
            .map((group) => {
                const materials = group.materials.filter(
                    (row) =>
                        (!prefs.missingOnly || row.missing > 0) &&
                        (!prefs.ownedOnly || row.owned > 0) &&
                        (!prefs.rarity || row.item.rarity === Number(prefs.rarity)),
                );
                return {
                    ...group,
                    materials,
                    characters: [...new Set(materials.flatMap((row) => row.characters))],
                };
            })
            .filter((group) => group.materials.length);
        return groups.sort((a, b) => {
            const rank = (group: FarmingGroup) =>
                group.source && this.availability(group.source) === 'available' ? 0 : 1;
            const difference =
                prefs.sort === 'missing'
                    ? b.materials.filter((row) => row.missing > 0).length -
                      a.materials.filter((row) => row.missing > 0).length
                    : prefs.sort === 'characters'
                      ? b.characters.length - a.characters.length
                      : prefs.sort === 'today'
                        ? rank(a) - rank(b)
                        : prefs.sort === 'region'
                          ? (a.source?.region ?? '').localeCompare(b.source?.region ?? '')
                          : 0;
            return (
                difference ||
                (prefs.sort === 'source'
                    ? (a.source ? this.config().sources.findIndex(source => source.id === a.id) : 10000) - (b.source ? this.config().sources.findIndex(source => source.id === b.id) : 10000)
                    : 0) ||
                (a.source?.name ?? 'Source not configured').localeCompare(
                    b.source?.name ?? 'Source not configured',
                )
            );
        });
    });
    readonly materials = computed(() =>
        [
            ...new Map(
                this.groups()
                    .flatMap((group) => group.materials)
                    .map((row) => [row.item.id, row]),
            ).values(),
        ].sort((a, b) =>
            this.prefs().sort === 'missing'
                ? b.missing - a.missing || a.item.name.localeCompare(b.item.name)
                : a.item.name.localeCompare(b.item.name),
        ),
    );
    readonly selectedMaterial = computed(() =>
        this.result().materials.find((row) => row.item.id === this.selectedMaterialId()),
    );
    readonly busy = computed(
        () => this.store.saving() || this.store.loading() || !this.store.initialized(),
    );
    constructor() {
        effect(() => {
            const key = this.preferenceKey();
            let preferences = defaultFarmingPreferences();
            try {
                const stored: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
                if (validFarmingPreferences(stored)) {preferences = stored;}
            } catch {
                /* Keep the planner usable if browser storage is unavailable. */
            }
            this.prefs.set(preferences);
            this.selectedMaterialId.set('');
            this.dataOpen.set(false);
            this.error.set('');
            this.message.set('');
        });
        const timer = setInterval(() => this.now.set(Date.now()), 60000);
        inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }
    private preferenceKey(): string {
        return `gg-farming-v1:${this.store.auth?.user()?.id ?? 'guest'}:${this.game()}`;
    }
    setPrefs(update: Partial<FarmingPreferences>): void {
        const prefs = { ...this.prefs(), ...update };
        this.prefs.set(prefs);
        try {
            localStorage.setItem(this.preferenceKey(), JSON.stringify(prefs));
        } catch {
            this.message.set(
                'Preferences could not be saved in this browser. Your plans and inventory are unchanged.',
            );
        }
    }
    selected(id: string): boolean {
        return this.selectedCharacters().some((character) => character.id === id);
    }
    toggleCharacter(id: string): void {
        const selected = this.selectedCharacters().map((character) => character.id);
        this.setPrefs({
            selected: selected.includes(id)
                ? selected.filter((item) => item !== id)
                : [...selected, id],
        });
    }
    selectAll(): void {
        this.setPrefs({ selected: this.choices().map((character) => character.id) });
    }
    clear(): void {
        this.setPrefs({ selected: [] });
    }
    character(id: string): Entry | undefined {
        return this.characters().find((entry) => entry.id === id);
    }
    goal(entry: Entry): string {
        const build = entry.characterCollection;
        return build?.target
            ? `Level ${build.level} → ${build.target.level} · Ascension ${
                  build.ascensionRank ?? 0
              } → ${build.target.ascensionRank ?? 0}`
            : 'No development goal set';
    }
    availability(source: FarmingSource): string {
        return sourceAvailability(source, this.now(), this.server());
    }
    sources(row: FarmingMaterial): FarmingSource[] {
        return this.config().sources.filter((source) => source.materialIds.includes(row.item.id));
    }
    openMaterial(row: FarmingMaterial): void {
        this.selectedMaterialId.set(row.item.id);
        this.quantity.set(row.owned);
        this.error.set('');
        this.message.set('');
    }
    closeMaterial(): void {
        if (!this.busy()) {this.selectedMaterialId.set('');}
    }
    adjust(delta: number): void {
        const row = this.selectedMaterial();
        if (row)
            {this.quantity.set(
                Math.min(row.item.maxStack ?? 1e9, Math.max(0, (this.quantity() ?? 0) + delta)),
            );}
    }
    async saveQuantity(): Promise<void> {
        const row = this.selectedMaterial(),
            quantity = this.quantity();
        if (!row || this.busy()) {return;}
        if (
            typeof quantity !== 'number' ||
            !Number.isSafeInteger(quantity) ||
            quantity < 0 ||
            quantity > (row.item.maxStack ?? 1e9)
        ) {
            this.error.set('Enter a whole quantity within the item’s stack limit.');
            return;
        }
        if (await this.store.saveInventoryQuantities(this.game(), { [row.item.id]: quantity }))
            {this.message.set('Inventory saved. Farming requirements updated.');}
        else
            {this.error.set(
                this.store.error() || 'Could not save inventory. Your quantity is still open.',
            );}
    }
    emptyHeading(): string {
        if (!this.selectedCharacters().length && !this.prefs().includeUnassigned) {return 'Select characters to plan your farming';}
        if (this.result().issues.length) {return 'Upgrade data is incomplete';}
        if (this.prefs().mode === 'characters' && this.selectedCharacters().length && this.selectedCharacters().every(entry => entry.characterCollection?.target && !hasCharacterGoal(entry.characterCollection))) {return 'Selected development goals reached';}
        if (!this.result().materials.length && this.prefs().mode === 'characters') {return 'No material costs for the selected transitions';}
        return this.result().materials.length && this.missingCount() === 0 ? 'Inventory covers the known requirements' : 'No matching materials';
    }
    emptyDescription(): string {
        return this.result().issues.length ? 'Configure verified upgrade recipes, or use saved material plans with explicit quantities. Missing data is not treated as zero cost.' : 'Adjust the selection and filters, or set a development goal in Characters.';
    }
}
