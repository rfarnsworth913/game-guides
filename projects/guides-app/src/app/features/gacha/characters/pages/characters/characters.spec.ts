import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Characters } from "./characters";
import { WorkspaceStore, Entry } from "../../../../../core/state/workspace.store";
import type { CharacterRules } from "../../../../../../../../lib/types/character.type";
import { emptyCharacterCollection, emptyCharacterDefinition } from "../../../../../../../../common/characters/characters";
import { characterCard } from '../../utils/character-inventory';
import { emptyPatchOverview } from '@common/quests/story-template';

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
    async function setup(editor = false, focusId = '') {
        const entries = signal([structuredClone(character)]);
        const saveCharacterCollection = vi.fn(async (id: string, collection: NonNullable<Entry['characterCollection']>) => {
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
            providers: [provideRouter([]), { provide: WorkspaceStore, useValue: store }],
        }).compileComponents();
        const fixture = TestBed.createComponent(Characters);
        fixture.componentRef.setInput('game', 'genshin');
        fixture.componentRef.setInput('focusId', focusId);
        fixture.detectChanges();
        return {
            fixture,
            store,
            entries,
            saveCharacterCollection,
            root: (fixture.nativeElement as HTMLElement) as HTMLElement,
        };
    }
    it('keeps a shared character draft across editor sections and discards it on cancel', async () => {
        const { fixture, root, entries } = await setup(true);
        const component = fixture.componentInstance;
        component.editDefinition(entries()[0]);
        fixture.detectChanges();
        const navigation = root.querySelector('nav[aria-label="Shared character editor sections"]')!;
        const buttons = [...navigation.querySelectorAll<HTMLButtonElement>('button')];
        expect(buttons).toHaveLength(6);
        expect(buttons[0].getAttribute('aria-current')).toBe('page');
        const input = root.querySelector<HTMLInputElement>('.character-form-grid input')!;
        input.value = 'Updated name';
        input.dispatchEvent(new Event('input'));
        const panel = root.querySelector<HTMLElement>('.character-editor-main')!;
        panel.scrollTop = 200;
        buttons[3].click();
        fixture.detectChanges();
        expect(panel.scrollTop).toBe(0);
        expect(root.querySelector('.character-editor-panel-heading h3')?.textContent).toBe('Skills');
        expect(root.querySelector('.character-form-grid')?.parentElement?.hidden).toBe(true);
        component.definitionEditor!.characterDefinition!.skills[0].description = 'Draft skill';
        buttons[0].click();
        fixture.detectChanges();
        expect(input.value).toBe('Updated name');
        expect(component.definitionEditor!.characterDefinition!.skills[0].description).toBe('Draft skill');
        expect(entries()[0].name).toBe('Vesna');
        expect(entries()[0].characterDefinition!.skills[0].description).toBe('Shared skill');
        root.querySelector<HTMLButtonElement>('.character-editor-footer button:last-child')!.click();
        fixture.detectChanges();
        expect(root.querySelector('.shared-character-editor')).toBeNull();
        component.editDefinition(entries()[0]);
        fixture.detectChanges();
        expect(component.editorSection().id).toBe('overview');
        expect(component.definitionEditor!.name).toBe('Vesna');
    });
    it('uses configured dropdown options for weapon and damage types without discarding existing values', async () => {
        const { fixture, root, entries, store } = await setup(true);
        store.characterRules.update(rules => ({ ...rules, genshin: { ...rules['genshin'], weaponTypes: ['Sword', 'Bow'], damageTypes: ['Physical', 'Fire'] } }));
        fixture.componentInstance.editDefinition(entries()[0]);
        fixture.detectChanges();
        await fixture.whenStable();
        const weapon = root.querySelector<HTMLSelectElement>('select[aria-label="Weapon Type"]')!;
        const damage = root.querySelector<HTMLSelectElement>('select[aria-label="Damage Type"]')!;
        expect([...weapon.options].map(option => option.value)).toEqual(['', 'Bow', 'Sword']);
        expect([...damage.options].map(option => option.value)).toEqual(['', 'Fire', 'Physical']);
        expect(store.characterRules()['genshin'].weaponTypes).toEqual(['Sword', 'Bow']);
        expect(weapon.value).toBe('Sword');
        expect(damage.value).toBe('Physical');
        weapon.value = 'Bow'; weapon.dispatchEvent(new Event('change'));
        damage.value = 'Fire'; damage.dispatchEvent(new Event('change'));
        expect(fixture.componentInstance.definitionEditor!.characterDefinition!.weaponType).toBe('Bow');
        expect(fixture.componentInstance.definitionEditor!.characterDefinition!.damageType).toBe('Fire');
        store.characterRules.update(rules => ({ ...rules, genshin: { ...rules['genshin'], weaponTypes: [], damageTypes: [] } }));
        fixture.detectChanges();
        expect([...weapon.options].map(option => option.value)).toEqual(['', 'Bow']);
        expect([...damage.options].map(option => option.value)).toEqual(['', 'Fire']);
    });
    it('separates attributes from resources and saves the entire shared draft together', async () => {
        const { fixture, root, entries, store } = await setup(true);
        const save = vi.fn(async (_entry: Entry) => true);
        Object.assign(store, { save });
        const component = fixture.componentInstance;
        component.editDefinition(entries()[0]);
        fixture.detectChanges();
        const panels = [...root.querySelectorAll<HTMLElement>('.character-editor-fields > div')];
        expect(panels[1].textContent).toContain('Progression profile');
        expect(panels[1].textContent).not.toContain('Grouped character resources');
        expect(panels[5].textContent).toContain('Grouped character resources');
        expect(panels[5].textContent).not.toContain('Progression profile');
        component.definitionEditor!.name = 'Updated name';
        component.definitionEditor!.characterDefinition!.skills[0].description = 'Updated skill';
        await component.saveDefinition();
        expect(save).toHaveBeenCalledOnce();
        const saved = save.mock.calls[0][0];
        expect(saved.name).toBe('Updated name');
        expect(saved.characterDefinition!.skills[0].description).toBe('Updated skill');
        expect(component.definitionEditor).toBeNull();
    });
    it('edits icon, splash art and banner independently in the images panel', async () => {
        const { fixture, root, entries, store } = await setup(true);
        const save = vi.fn(async (_entry: Entry) => true);
        Object.assign(store, { save });
        const component = fixture.componentInstance;
        component.editDefinition(entries()[0]);
        component.selectEditorSection(component.editorSections[2]);
        component.setHeadshot('/api/games/genshin/images/character-icon.webp');
        component.setSplashArt('/api/games/genshin/images/splash.webp');
        component.setCharacterBanner('/api/games/genshin/images/banner.webp');
        fixture.detectChanges();
        expect([...root.querySelectorAll('.character-image-card h4')].map(heading => heading.textContent)).toEqual(['Character Icon', 'Splash Art', 'Character Banner']);
        expect(root.querySelector('.character-banner-card')).toBe(root.querySelector('.character-image-grid')?.lastElementChild);
        expect(root.querySelector('.character-image-grid')?.textContent).toContain('1920 × 480');
        expect(component.definitionEditor!.characterDefinition!.headshot).toBe('/api/games/genshin/images/character-icon.webp');
        expect(component.definitionEditor!.characterInformation!.imageUrl).toBe('/api/games/genshin/images/splash.webp');
        expect(component.definitionEditor!.characterDefinition!.banner).toBe('/api/games/genshin/images/banner.webp');
        expect(entries()[0].characterDefinition!.headshot).toBeUndefined();
        await component.saveDefinition();
        expect(save).toHaveBeenCalledOnce();
        expect(save.mock.calls[0][0].characterInformation!.imageUrl).toBe('/api/games/genshin/images/splash.webp');
        expect(save.mock.calls[0][0].characterDefinition!.banner).toBe('/api/games/genshin/images/banner.webp');
    });
    it('removes the icon and optional banner without removing splash art', async () => {
        const { fixture, entries } = await setup(true);
        const component = fixture.componentInstance;
        component.editDefinition(entries()[0]);
        component.setHeadshot('/api/games/genshin/images/icon.webp');
        component.setSplashArt('/api/games/genshin/images/splash.webp');
        component.setCharacterBanner('/api/games/genshin/images/banner.webp');
        component.setHeadshot('');
        component.setCharacterBanner('');
        expect(component.definitionEditor!.characterDefinition!.headshot).toBeUndefined();
        expect(component.definitionEditor!.icon).toBeUndefined();
        expect(component.definitionEditor!.characterDefinition!.banner).toBeUndefined();
        expect(component.definitionEditor!.characterInformation!.imageUrl).toBe('/api/games/genshin/images/splash.webp');
    });
    it('opens a linked character plan on the initial render and permits closing it', async () => {
        const { fixture, root } = await setup(false, 'vesna');
        await fixture.whenStable(); fixture.detectChanges();
        expect(root.querySelector('[role="dialog"]')?.textContent).toContain('Vesna');
        fixture.componentInstance.closeDetails(); fixture.detectChanges();
        expect(root.querySelector('[role="dialog"]')).toBeNull();
    });
    it('combines dynamic filters, alternate-name search, sorting and pagination without resetting on layout changes', async () => {
        const { fixture, root, entries, store } = await setup(); const component = fixture.componentInstance;
        entries.set(Array.from({ length: 30 }, (_, index) => ({ ...structuredClone(character), id: `character-${index}`, name: `Character ${String(index).padStart(2, '0')}`, rarity: index % 2 ? 4 : 5,
            characterDefinition: { ...character.characterDefinition!, alternateNames: index === 29 ? ['Hidden Alias'] : [], attributes: { path: index % 2 ? 'Harmony' : 'Hunt' } },
            characterCollection: { ...emptyCharacterCollection(), favorite: index % 2 === 0, level: index + 1 } })));
        store.characterRules.update(values => ({ ...values, genshin: { ...values['genshin'], attributes: [{ id: 'path', label: 'Path', type: 'enum', options: ['Harmony', 'Hunt'], displayOrder: 0, filterable: true, visibleInHeader: true }] } }));
        component.pageSize.set(12); fixture.detectChanges();
        expect(component.pageCards()).toHaveLength(12); expect(component.pageCount()).toBe(3);
        component.page.set(2); fixture.detectChanges(); expect(component.resultStart()).toBe(13);
        component.sort.set('level-desc'); fixture.detectChanges(); expect(component.currentPage()).toBe(1); expect(component.pageCards()[0].currentLevel).toBe(30);
        component.page.set(2); component.viewMode.set('list'); fixture.detectChanges();
        expect(component.currentPage()).toBe(2); expect(component.sort()).toBe('level-desc'); expect(root.querySelector('.character-list')).not.toBeNull();
        component.setAttributeFilter('path', 'Hunt'); component.favoritesOnly.set(true); fixture.detectChanges();
        expect(component.filteredCards()).toHaveLength(15); expect(component.activeFilterCount()).toBe(2); expect(component.currentPage()).toBe(1);
        component.rarity.set('4'); fixture.detectChanges(); expect(component.filteredCards()).toHaveLength(0);
        component.clearFilters(); component.search.set('  hidden ALIAS  '); fixture.detectChanges();
        expect(component.pageCards().map(card => card.characterId)).toEqual(['character-29']);
        component.search.set(''); component.pageSize.set(0); fixture.detectChanges(); expect(component.pageCards()).toHaveLength(30);
        expect(entries()[0].id).toBe('character-0');
    });
    it('keeps ownership separate from navigation and preserves progression while updating statistics', async () => {
        const { fixture, root, entries, saveCharacterCollection } = await setup(); const component = fixture.componentInstance;
        const before = structuredClone(entries()[0].characterCollection!);
        root.querySelector<HTMLButtonElement>('.character-ownership')!.click(); await fixture.whenStable(); fixture.detectChanges();
        expect(root.querySelector('[role="dialog"]')).toBeNull(); expect(saveCharacterCollection).toHaveBeenCalledWith('vesna', { ...before, owned: false });
        expect(component.ownedCount()).toBe(0); expect(entries()[0].characterCollection!.gear).toEqual(before.gear);
        component.tab.set('catalog'); fixture.detectChanges();
        root.querySelector<HTMLButtonElement>('.character-ownership')!.click(); await fixture.whenStable(); fixture.detectChanges();
        expect(component.ownedCount()).toBe(1); expect(root.querySelector('[role="status"]')?.textContent).toContain('added to');
        expect(entries()[0].characterDefinition).toEqual(character.characterDefinition);
    });
    it('rolls ownership back on failure, prevents conflicting actions, and preserves the detail draft', async () => {
        const { fixture, entries, saveCharacterCollection, root } = await setup(); const component = fixture.componentInstance;
        let release!: (saved: boolean) => void;
        saveCharacterCollection.mockImplementationOnce(() => new Promise<boolean>(resolve => {release = resolve;}));
        const save = component.toggleOwnership(entries()[0]); fixture.detectChanges();
        expect(component.ownedCount()).toBe(0); expect(component.busy()).toBe(true);
        await component.toggleOwnership(entries()[0]); expect(saveCharacterCollection).toHaveBeenCalledTimes(1);
        release(false); await save; fixture.detectChanges(); expect(component.ownedCount()).toBe(1); expect(root.querySelector('[role="alert"]')?.textContent).toContain('Could not save ownership');
        component.details(entries()[0]); component.collection!.level = 60;
        entries.update(values => values.map(entry => ({ ...entry, characterCollection: { ...entry.characterCollection!, level: 70 } }))); fixture.detectChanges();
        expect(component.cards()[0].currentLevel).toBe(70); expect(component.collection!.level).toBe(60);
    });
    it('includes unowned plans, supports favorites, and filters unfinished or reached goals', async () => {
        const { fixture, entries } = await setup(); const component = fixture.componentInstance;
        entries.update(values => values.map(entry => ({ ...entry, characterCollection: { ...entry.characterCollection!, owned: false, target: { level: 80, gear: {}, progression: {} } } }))); fixture.detectChanges();
        expect(component.collectionCards()).toHaveLength(1); expect(component.cards()[0].planned).toBe(true);
        await component.toggleFavorite(entries()[0]); fixture.detectChanges(); expect(component.cards()[0].favorite).toBe(true);
        component.progressionFilter.set('unfinished'); fixture.detectChanges(); expect(component.visible()).toHaveLength(1);
        component.progressionFilter.set('reached'); fixture.detectChanges(); expect(component.visible()).toHaveLength(0);
        component.progressionFilter.set('planned'); fixture.detectChanges(); expect(component.visible()).toHaveLength(1);
        expect(component.maxLevelCount()).toBe(0);
    });
    it('uses dedicated headshots and handles broken or non-square image sources', async () => {
        const { fixture, entries, root } = await setup();
        entries.update(values => values.map(entry => ({ ...entry, icon: '/assets/full-art.webp', characterInformation: { ...emptyPatchOverview(), imageUrl: '/assets/full-art.webp' } }))); fixture.detectChanges();
        expect(root.querySelector('.character-portrait img')).toBeNull();
        entries.update(values => values.map(entry => ({ ...entry, characterDefinition: { ...entry.characterDefinition!, headshot: '/assets/headshot.webp' } }))); fixture.detectChanges();
        const image = root.querySelector<HTMLImageElement>('.character-portrait img')!;
        expect(image.getAttribute('width')).toBe('92'); expect(image.getAttribute('height')).toBe('92'); expect(image.getAttribute('loading')).toBe('lazy');
        image.dispatchEvent(new Event('error')); fixture.detectChanges(); expect(root.querySelector('.character-portrait img')).toBeNull();
        entries.update(values => values.map(entry => ({ ...entry, characterDefinition: { ...entry.characterDefinition!, headshot: '/assets/new-headshot.webp' } }))); fixture.detectChanges();
        const tall = root.querySelector<HTMLImageElement>('.character-portrait img')!;
        Object.defineProperty(tall, 'naturalWidth', { value: 100 }); Object.defineProperty(tall, 'naturalHeight', { value: 300 });
        tall.dispatchEvent(new Event('load')); fixture.detectChanges(); expect(root.querySelector('.character-portrait img')).toBeNull();
    });
    it.each(['endfield', 'genshin', 'hsr', 'fgo'])('builds cards from the same registry and profile contracts for %s', async game => {
        const rules: CharacterRules = { levelCap: 100, rarities: [4, 5], rarityLabels: { '5': 'SSR' }, weaponTypes: [], damageTypes: [], roles: [], equipmentSlots: [], progressionTracks: [],
            attributes: [{ id: 'classification', label: 'Classification', type: 'enum', options: ['Configured class'], displayOrder: 0, filterable: true, visibleInHeader: true }],
            progressionProfiles: [{ id: 'profile', gameId: game, tracks: [{ id: 'level', label: 'Level', type: 'level', minValue: 1, maxValue: 80, displayOrder: 0 }] }] };
        const entry = { ...structuredClone(character), game, characterDefinition: { ...character.characterDefinition!, progressionProfileId: 'profile', attributes: { classification: 'Configured class' } }, characterCollection: { ...emptyCharacterCollection(), level: 40, target: { level: 80, gear: {}, progression: {} } } };
        const card = characterCard(entry, rules);
        expect(card.rarityLabel).toBe('SSR'); expect(card.attributes).toEqual([{ id: 'classification', label: 'Classification', value: 'Configured class' }]);
        expect(card.maximumLevel).toBe(80); expect(card.progressionPercent).toBeCloseTo(39 / 79 * 100);
        const { fixture, store, entries } = await setup(); fixture.componentRef.setInput('game', game); store.characterRules.set({ [game]: rules }); entries.set([entry]); fixture.detectChanges();
        expect(fixture.componentInstance.pageCards()[0].rarityLabel).toBe('SSR');
        entries.update(values => values.map(entry => ({ ...entry, characterCollection: { ...entry.characterCollection!, level: 80 } }))); fixture.detectChanges();
        expect(fixture.componentInstance.maxLevelCount()).toBe(1);
    });
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
        expect(dialog?.textContent).toContain('Character Game Rules');
        [...dialog!.querySelectorAll<HTMLButtonElement>('nav button')].find(button => button.textContent === 'Progression')!.click();
        fixture.detectChanges();
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
        [...root.querySelectorAll<HTMLButtonElement>('[role="dialog"] nav button')].find(button => button.textContent === 'Progression')!.click();
        fixture.detectChanges();
        const category = root.querySelector<HTMLSelectElement>('[aria-label="Equipment enhancement category"]')!;
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
        expect(root.textContent).toContain('Current Ascension rank');
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
                target: (expect.objectContaining({ level: 90 }) as unknown),
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
