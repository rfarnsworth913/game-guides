import {TestBed} from '@angular/core/testing';
import type {CharacterRules} from '@lib/types/character.type';
import {InventoryRulesEditor} from './inventory-rules-editor';

describe('Inventory category editor', () => {
    it('reorders categories without changing identifiers, parents or rarity colors', () => {
        const fixture = TestBed.createComponent(InventoryRulesEditor);
        const rules: CharacterRules = {
            levelCap: 90, rarities: [5], weaponTypes: [], damageTypes: [], roles: [], equipmentSlots: [], progressionTracks: [],
            inventory: {categories: [
                {id: 'currency', label: 'Currency', displayOrder: 0, enabled: true},
                {id: 'skill', label: 'Skills', displayOrder: 1, enabled: true, parentCategoryId: 'currency'},
            ], rarities: [{rarity: 5, color: '#ffcc00'}], recipes: []},
        };
        fixture.componentRef.setInput('rules', rules);
        fixture.componentRef.setInput('game', 'genshin');
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        expect(root.querySelectorAll('.category-row')).toHaveLength(2);
        expect(root.querySelectorAll('gg-game-image-picker')).toHaveLength(2);
        expect(root.querySelectorAll('.rarity-card')).toHaveLength(1);
        const editor = fixture.componentInstance;
        editor.draggedCategory = 1;
        const event = new Event('drop', {cancelable: true});
        editor.dropCategory(event as DragEvent, 0);
        expect(event.defaultPrevented).toBe(true);
        expect(editor.draggedCategory).toBeNull();
        expect(rules.inventory!.categories.map(category => [category.id, category.displayOrder])).toEqual([['skill', 0], ['currency', 1]]);
        expect(rules.inventory!.categories[0].parentCategoryId).toBe('currency');
        expect(rules.inventory!.rarities).toEqual([{rarity: 5, color: '#ffcc00'}]);
        editor.categoryKey(new KeyboardEvent('keydown', {key: 'ArrowDown', altKey: true}), 0);
        expect(rules.inventory!.categories.map(category => category.id)).toEqual(['currency', 'skill']);
        editor.moveCategory(0, -1);
        expect(rules.inventory!.categories[0].id).toBe('currency');
        fixture.detectChanges();
        root.querySelector<HTMLButtonElement>('button[aria-label="Remove category Skills"]')!.click();
        fixture.detectChanges();
        expect(root.querySelectorAll('.category-row')).toHaveLength(1);
        expect(rules.inventory!.categories[0].id).toBe('currency');
    });
});
