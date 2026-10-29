import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Characters } from './characters';
import { WorkspaceStore, Entry } from './workspace.store';
import {
    CharacterRules,
    emptyCharacterCollection,
    emptyCharacterDefinition,
} from '../../../../common/characters';

const character: Entry = {
    id: 'vesna',
    game: 'genshin',
    kind: 'characters',
    name: 'Vesna',
    rarity: 5,
    category: '',
    notes: 'Shared description',
    order: 0,
    day: '',
    members: [],
    requirements: [],
    completed: false,
    quantity: 0,
    target: 0,
    characterDefinition: {
        ...emptyCharacterDefinition(),
        weaponType: 'Sword',
        damageType: 'Physical',
        roles: ['DPS'],
        skills: [{ name: 'Strike', description: 'Shared skill' }],
        guides: [{ title: 'Build strategy', url: 'https://example.com/vesna' }],
    },
    characterCollection: {
        ...emptyCharacterCollection(),
        level: 50,
        gear: { weapon: ['Excalibur'] },
    },
};

describe('Character management', () => {
    async function setup(editor = false) {
        const entries = signal([structuredClone(character)]);
        const saveCharacterCollection = vi.fn(async (id, collection) => {
            entries.update((values) =>
                values.map((entry) =>
                    entry.id === id
                        ? { ...entry, characterCollection: structuredClone(collection) }
                        : entry,
                ),
            );
            return true;
        });
        const store = {
            entries,
            characterRules: signal<Record<string, CharacterRules>>({
                genshin: {
                    levelCap: 90,
                    rarities: [4, 5],
                    weaponTypes: [],
                    damageTypes: [],
                    roles: [],
                    equipmentSlots: [{ id: 'weapon', label: 'Weapon', limit: 1 }],
                    progressionTracks: [],
                },
            }),
            canEdit: signal(editor),
            saving: signal(false),
            loading: signal(false),
            initialized: signal(true),
            error: signal(''),
            saveCharacterCollection,
        };
        await TestBed.configureTestingModule({
            providers: [{ provide: WorkspaceStore, useValue: store }],
        }).compileComponents();
        const fixture = TestBed.createComponent(Characters);
        fixture.componentRef.setInput('game', 'genshin');
        fixture.detectChanges();
        return {
            fixture,
            store,
            entries,
            saveCharacterCollection,
            root: fixture.nativeElement as HTMLElement,
        };
    }
    it('shows game rules for editors and opens the shared rules form', async () => {
        const { fixture, root } = await setup(true);
        const rulesButton = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
            (button) => button.textContent?.trim() === 'Game rules',
        );
        expect(rulesButton).toBeDefined();
        expect(rulesButton!.disabled).toBe(false);
        rulesButton!.click();
        fixture.detectChanges();
        const dialog = root.querySelector('[role="dialog"]');
        expect(dialog?.textContent).toContain('Equipment slots');
        expect(dialog?.textContent).toContain('Progression tracks');
        expect(fixture.componentInstance.rulesEditor?.levelCap).toBe(90);
    });
    it('keeps shared game rules controls hidden for players', async () => {
        const { root } = await setup();
        expect(
            [...root.querySelectorAll('button')].some(
                (button) => button.textContent?.trim() === 'Game rules',
            ),
        ).toBe(false);
    });
    it('offers defined enhancement categories for equipment slots in existing rules', async () => {
        const { fixture, root } = await setup(true);
        fixture.componentInstance.editRules();
        fixture.componentInstance.rulesEditor!.enhancementCategories = ['Weapon', 'Artifact'];
        fixture.detectChanges();
        const category = root.querySelector<HTMLSelectElement>('[role="dialog"] select')!;
        expect([...category.options].map((option) => option.textContent?.trim())).toEqual([
            'Uncategorized',
            'Weapon',
            'Artifact',
        ]);
        category.value = 'Artifact';
        category.dispatchEvent(new Event('change'));
        expect(fixture.componentInstance.rulesEditor!.equipmentSlots[0].category).toBe('Artifact');
    });
    it('gates personal character and skill levels by ascension and preserves individual maxima', async () => {
        const { fixture, root, store, entries, saveCharacterCollection } = await setup();
        store.characterRules.update((values) => ({
            ...values,
            genshin: {
                ...values['genshin'],
                ascensionRanks: [
                    { levelCap: 20, skillLevelCap: 1 },
                    { levelCap: 90, skillLevelCap: 6 },
                ],
            },
        }));
        entries.update((values) =>
            values.map((entry) => ({
                ...entry,
                characterDefinition: {
                    ...entry.characterDefinition!,
                    skills: [{ id: 'strike', name: 'Strike', description: '', maxLevel: 4 }],
                },
            })),
        );
        fixture.componentInstance.details(entries()[0]);
        fixture.detectChanges();
        expect(root.textContent).toContain('Current ascension rank');
        expect(fixture.componentInstance.characterLevelCap()).toBe(20);
        fixture.componentInstance.setSkillLevel('strike', 2);
        await fixture.componentInstance.saveCollection();
        expect(saveCharacterCollection).not.toHaveBeenCalled();
        const build = fixture.componentInstance.collection!;
        build.ascensionRank = 1;
        expect(fixture.componentInstance.characterLevelCap()).toBe(90);
        expect(
            fixture.componentInstance.skillLevelCap(entries()[0].characterDefinition!.skills[0]),
        ).toBe(4);
        await fixture.componentInstance.saveCollection();
        expect(saveCharacterCollection).toHaveBeenCalledWith(
            'vesna',
            expect.objectContaining({ ascensionRank: 1, skillLevels: { strike: 2 } }),
        );
    });
    it('opens shared information, guide links and a personal draft without requiring editor permission', async () => {
        const { fixture, entries, root, saveCharacterCollection } = await setup();
        root.querySelector<HTMLButtonElement>('.character-card')!.click();
        fixture.detectChanges();
        expect(root.querySelector('[role="dialog"]')?.textContent).not.toContain('Shared skill');
        root.querySelector<HTMLButtonElement>('.character-reference-button')!.click();
        fixture.detectChanges();
        expect(root.querySelector('#character-reference')?.textContent).toContain('Shared skill');
        expect(root.querySelector('.character-guide-links a')?.getAttribute('href')).toBe(
            'https://example.com/vesna',
        );
        expect(root.textContent).not.toContain('Edit shared info');
        fixture.componentInstance.collection!.level = 60;
        expect(entries()[0].characterCollection?.level).toBe(50);
        await fixture.componentInstance.saveCollection();
        expect(saveCharacterCollection).toHaveBeenCalledWith(
            'vesna',
            expect.objectContaining({ owned: true, level: 60 }),
        );
        expect(entries()[0].characterDefinition?.skills[0].description).toBe('Shared skill');
    });
    it('persists independent goals, notes and personal links without changing shared data', async () => {
        const { fixture, root, entries, saveCharacterCollection } = await setup();
        const component = fixture.componentInstance;
        component.details(entries()[0]);
        component.setTargetLevel(90);
        component.collection!.notes = 'Farm on Monday';
        component.addPersonalGuide();
        component.collection!.personalGuides![0] = {
            title: 'My guide',
            url: 'https://example.com/personal',
        };
        expect(component.collection!.level).toBe(50);
        expect(component.hasUnsavedChanges()).toBe(true);
        await component.saveCollection();
        expect(saveCharacterCollection).toHaveBeenCalledWith(
            'vesna',
            expect.objectContaining({
                level: 50,
                target: expect.objectContaining({ level: 90 }),
                notes: 'Farm on Monday',
                personalGuides: [{ title: 'My guide', url: 'https://example.com/personal' }],
            }),
        );
        expect(component.hasUnsavedChanges()).toBe(false);
        component.closeDetails();
        component.details(entries()[0]);
        fixture.detectChanges();
        expect(component.collection!.target!.level).toBe(90);
        expect(root.querySelector('.planner-sidebar')?.textContent).toContain('My guide');
        expect(root.querySelector('.planner-materials')?.textContent).toContain('Unavailable');
        expect(root.querySelector('.planner-skills')).toBeNull();
        expect(entries()[0].notes).toBe('Shared description');
        expect(entries()[0].characterDefinition!.guides).toHaveLength(1);
    });
    it('rejects goals below current values and retains the draft after save failure', async () => {
        const { fixture, entries, saveCharacterCollection } = await setup();
        const component = fixture.componentInstance;
        component.details(entries()[0]);
        component.setTargetLevel(49);
        await component.saveCollection();
        expect(saveCharacterCollection).not.toHaveBeenCalled();
        expect(component.error).toContain('Targets cannot be below');
        component.setTargetLevel(90);
        saveCharacterCollection.mockResolvedValueOnce(false);
        await component.saveCollection();
        expect(component.collection!.target!.level).toBe(90);
        expect(component.hasUnsavedChanges()).toBe(true);
    });
    it('requires confirmation before removing a character from the collection', async () => {
        const { fixture, root, saveCharacterCollection } = await setup();
        root.querySelector<HTMLButtonElement>('.character-card')!.click();
        fixture.detectChanges();
        root.querySelector<HTMLButtonElement>('.character-remove')!.click();
        fixture.detectChanges();
        expect(root.querySelector('.character-remove-confirm')?.textContent).toContain(
            'The shared character stays in the catalog',
        );
        expect(saveCharacterCollection).not.toHaveBeenCalled();
        await fixture.componentInstance.removeCollection();
        fixture.detectChanges();
        expect(saveCharacterCollection).toHaveBeenCalledWith(
            'vesna',
            expect.objectContaining({ owned: false, gear: {} }),
        );
        expect(root.querySelector('.character-card')).toBeNull();
        fixture.componentInstance.tab.set('catalog');
        fixture.detectChanges();
        expect(root.querySelector('.character-card')?.textContent).toContain('Vesna');
    });
});
