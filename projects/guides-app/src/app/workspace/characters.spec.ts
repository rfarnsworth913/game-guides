import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Characters } from './characters';
import { WorkspaceStore, Entry } from './workspace.store';
import { emptyCharacterCollection, emptyCharacterDefinition } from '../../../../common/characters';

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
            characterRules: signal({
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
        expect([...root.querySelectorAll('button')].some(
            (button) => button.textContent?.trim() === 'Game rules',
        )).toBe(false);
    });
    it('opens shared information, guide links and a personal draft without requiring editor permission', async () => {
        const { fixture, entries, root, saveCharacterCollection } = await setup();
        root.querySelector<HTMLButtonElement>('.character-card')!.click();
        fixture.detectChanges();
        expect(root.querySelector('[role="dialog"]')?.textContent).toContain('Shared skill');
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
