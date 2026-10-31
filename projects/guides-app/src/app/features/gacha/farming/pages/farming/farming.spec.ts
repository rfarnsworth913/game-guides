import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Farming } from "./farming";
import { FarmingDataEditor } from "../../components/farming-data-editor/farming-data-editor";
import { WorkspaceStore, Entry } from "../../../../../core/state/workspace.store";
import type { CharacterRules } from "../../../../../../../../lib/types/character.type";
import { emptyCharacterCollection, emptyCharacterDefinition } from "../../../../../../../../common/characters/characters";
import type { FarmingConfig } from "../../../../../../../../lib/types/farming-config.type";

const item: Entry = {
    id: 'book',
    game: 'genshin',
    kind: 'inventory',
    name: 'Talent Book',
    category: 'Talent',
    notes: '',
    day: '',
    rarity: 3,
    members: [],
    requirements: [],
    completed: false,
    quantity: 4,
    target: 0,
    order: 0,
};
const character: Entry = {
    ...item,
    id: 'one',
    kind: 'characters',
    name: 'One',
    quantity: 0,
    characterDefinition: {
        ...emptyCharacterDefinition(),
        recipes: [
            { kind: 'level', from: 1, to: 2, materials: [{ item: 'book', amount: 3 }] },
            { kind: 'level', from: 2, to: 3, materials: [{ item: 'book', amount: 5 }] },
        ],
    },
    characterCollection: {
        ...emptyCharacterCollection(),
        target: { level: 3, gear: {}, progression: {} },
    },
};
const config: FarmingConfig = {
    sources: [
        {
            id: 'domain',
            name: 'Talent Domain',
            category: 'Domain',
            region: 'Region',
            location: '',
            materialIds: ['book'],
            days: [1, 4],
            url: 'https://example.com/domain',
            restrictions: '',
        },
        {
            id: 'shop',
            name: 'Material Shop',
            category: 'Shop',
            region: 'Region',
            location: '',
            materialIds: ['book'],
            days: [0, 1, 2, 3, 4, 5, 6],
            url: '',
            restrictions: 'Limited stock',
        },
    ],
    servers: [
        { id: 'asia', name: 'Asia', timeZone: 'Asia/Shanghai', resetHour: 4, resetMinute: 0 },
    ],
};
const rules: CharacterRules = {
    levelCap: 90,
    rarities: [3],
    weaponTypes: [],
    damageTypes: [],
    roles: [],
    equipmentSlots: [],
    progressionTracks: [],
    farming: config,
};

describe('Farming planner', () => {
    let storage: Map<string, string>;
    beforeEach(() => {
        storage = new Map();
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => storage.set(key, value),
        });
    });
    afterEach(() => vi.unstubAllGlobals());
    async function setup() {
        const entries = signal<Entry[]>([
            structuredClone(item),
            structuredClone(character),
            { ...structuredClone(character), id: 'two', name: 'Two' },
            { ...structuredClone(character), id: 'other-game', game: 'hsr' },
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
            characterRules: signal<Record<string, CharacterRules>>({
                genshin: structuredClone(rules),
            }),
            initialized: signal(true),
            loading: signal(false),
            saving: signal(false),
            canEdit: signal(false),
            saveInventoryQuantities,
            error: signal('Save failed'),
        };
        TestBed.configureTestingModule({
            providers: [provideRouter([]), { provide: WorkspaceStore, useValue: store }],
        });
        const fixture = TestBed.createComponent(Farming);
        fixture.componentRef.setInput('game', 'genshin');
        fixture.detectChanges();
        await fixture.whenStable();
        return { fixture, store, root: fixture.nativeElement as HTMLElement };
    }
    it('selects active owned characters, aggregates costs once, and remembers selection across navigation', async () => {
        const { fixture, root } = await setup();
        const component = fixture.componentInstance;
        expect(component.selectedCharacters().map((entry) => entry.id)).toEqual(['one', 'two']);
        expect(component.result().materials[0]).toMatchObject({
            required: 16,
            owned: 4,
            missing: 12,
        });
        expect(root.querySelectorAll('.farm-group')).toHaveLength(2);
        component.toggleCharacter('one');
        fixture.detectChanges();
        expect(component.result().materials[0].required).toBe(8);
        fixture.destroy();
        const restored = TestBed.createComponent(Farming);
        restored.componentRef.setInput('game', 'genshin');
        restored.detectChanges();
        await restored.whenStable();
        expect(restored.componentInstance.selectedCharacters().map((entry) => entry.id)).toEqual([
            'two',
        ]);
        restored.componentInstance.clear();
        restored.detectChanges();
        expect((restored.nativeElement as HTMLElement).textContent).toContain(
            'Select characters to plan your farming',
        );
    });
    it('switches groups/list/schedule, filters actual sources, and uses server reset days', async () => {
        const { fixture, root } = await setup();
        const component = fixture.componentInstance;
        component.setPrefs({ category: 'Shop', view: 'list' });
        fixture.detectChanges();
        expect(root.querySelectorAll('.farm-list article')).toHaveLength(1);
        component.setPrefs({ view: 'schedule' });
        fixture.detectChanges();
        expect(root.querySelectorAll('.farm-week > div')).toHaveLength(7);
        expect(root.textContent).toContain('Asia/Shanghai');
        component.setPrefs({ category: 'Domain', availableOnly: true });
        component.now.set(Date.parse('2026-10-29T20:00:00Z'));
        fixture.detectChanges();
        expect(component.groups()).toHaveLength(0);
        component.now.set(Date.parse('2026-10-29T19:30:00Z'));
        fixture.detectChanges();
        expect(component.groups()).toHaveLength(1);
    });
    it('updates canonical inventory for alternative sources and retains a failed edit', async () => {
        const { fixture, store } = await setup();
        const component = fixture.componentInstance;
        component.openMaterial(component.result().materials[0]);
        component.quantity.set(20);
        await component.saveQuantity();
        expect(store.saveInventoryQuantities).toHaveBeenCalledWith('genshin', { book: 20 });
        expect(component.allGroups().every((group) => group.materials[0].owned === 20)).toBe(true);
        expect(component.missingCount()).toBe(0);
        component.quantity.set(30);
        store.saveInventoryQuantities.mockResolvedValueOnce(false);
        await component.saveQuantity();
        expect(component.quantity()).toBe(30);
        expect(component.error()).toBe('Save failed');
    });
    it('shows missing recipes as incomplete data rather than free upgrades', async () => {
        const { fixture, store, root } = await setup();
        store.entries.update((values) =>
            values.map((entry) =>
                entry.kind === 'characters'
                    ? { ...entry, characterDefinition: emptyCharacterDefinition() }
                    : entry,
            ),
        );
        fixture.detectChanges();
        expect(root.querySelector('.farm-warning')?.textContent).toContain(
            'Requirements are incomplete',
        );
        expect(root.querySelector('.farm-summary')?.textContent).toContain('—');
        expect(root.textContent).not.toContain('Inventory covers the known requirements');
    });
});

describe('Farming data editor', () => {
    it('saves verified definitions through existing editor persistence without changing player plans or quantities', async () => {
        const entries = signal<Entry[]>([structuredClone(item), structuredClone(character)]);
        const replace = vi.fn(async (_entries: Entry[], _rules: Record<string, CharacterRules>) => true);
        const store = {
            entries,
            characterRules: signal({ genshin: structuredClone(rules) }),
            canEdit: signal(true),
            saving: signal(false),
            replace,
            error: signal(''),
        };
        TestBed.configureTestingModule({
            providers: [{ provide: WorkspaceStore, useValue: store }],
        });
        const fixture = TestBed.createComponent(FarmingDataEditor);
        fixture.componentRef.setInput('game', 'genshin');
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.componentInstance.data.sources[0].name = 'Verified domain';
        await fixture.componentInstance.save();
        expect(replace.mock.calls[0][0]).toEqual(entries());
        expect(replace.mock.calls[0][1]['genshin'].farming!.sources[0].name).toBe('Verified domain');
        expect(entries()[0].quantity).toBe(4);
        expect(entries()[1].characterCollection!.target!.level).toBe(3);
    });
});
