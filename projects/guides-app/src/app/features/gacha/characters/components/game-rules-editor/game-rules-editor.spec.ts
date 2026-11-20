import { TestBed } from '@angular/core/testing';
import { GameRulesEditor } from './game-rules-editor';
import type { CharacterRules } from '@lib/types/character.type';

const rules: CharacterRules = {levelCap: 100, rarities: [5], weaponTypes: [], damageTypes: [], roles: [], equipmentSlots: [], progressionTracks: []};
async function setup(original = rules, inventorySection: 'all' | 'categories' | 'recipes' = 'all') {
    const fixture = TestBed.createComponent(GameRulesEditor);
    fixture.componentRef.setInput('game', 'genshin');
    fixture.componentRef.setInput('gameName', 'Genshin Impact');
    fixture.componentRef.setInput('draft', structuredClone(original));
    fixture.componentRef.setInput('original', original);
    fixture.componentRef.setInput('inventorySection', inventorySection);
    fixture.detectChanges();
    return {fixture, editor: fixture.componentInstance, root: fixture.nativeElement as HTMLElement};
}
describe('Character game rules editor', () => {
    it.each([
        globalThis.undefined,
        {categories: [], rarities: [], recipes: []},
        {categories: [{id: 'currency', label: 'Currency', displayOrder: 0, enabled: true}], rarities: [{rarity: 5, color: '#ffcc00'}], recipes: []},
    ])('closes unchanged material categories without a discard prompt (%j)', async inventory => {
        const {fixture, editor, root} = await setup({...rules, inventory}, 'categories');
        await fixture.whenStable();
        const dismiss = vi.fn(); editor.dismissed.subscribe(dismiss);
        root.querySelector<HTMLDetailsElement>('.category-options')?.setAttribute('open', '');
        editor.close(); fixture.detectChanges(); await fixture.whenStable();
        expect(dismiss).toHaveBeenCalledOnce();
        expect(editor.discard).toBe(false);
        expect(root.querySelector('.discard-prompt')).toBeNull();
    });
    it('opens a dedicated category-definition screen with local drafts and validation', async () => {
        const original = {...rules, inventory: {categories: [], rarities: [], recipes: []}};
        const {fixture, editor, root} = await setup(original, 'categories');
        expect(root.querySelector('#rules-title')?.textContent).toBe('Material Categories');
        expect(root.querySelector('.section-editor-sidebar')).toBeNull();
        expect(root.querySelector('.material-categories')).not.toBeNull();
        expect(root.querySelector('.rarity-section')).not.toBeNull();
        expect(root.textContent).not.toContain('Recipe identifier');
        const add = [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '+ Add Category')!;
        add.click(); fixture.detectChanges(); await fixture.whenStable();
        const save = vi.fn(); editor.save.subscribe(save);
        editor.submit();
        expect(save).not.toHaveBeenCalled();
        expect(editor.validation.length).toBeGreaterThan(0);
        editor.draft().inventory!.categories[0].label = 'Skill Materials';
        editor.submit();
        expect(save).toHaveBeenCalledOnce();
        expect(original.inventory.categories).toHaveLength(0);
        editor.close(); fixture.detectChanges(); await fixture.whenStable();
        expect(root.textContent).toContain('Discard unsaved rules changes?');
    });
    it('keeps recipes on their own definition screen', async () => {
        const {root} = await setup(rules, 'recipes');
        expect(root.querySelector('#rules-title')?.textContent).toBe('Crafting & Conversion Recipes');
        expect(root.querySelector('.material-categories')).toBeNull();
        expect(root.querySelector('.rarity-section')).toBeNull();
        expect(root.textContent).toContain('+ Add Recipe');
    });
    it('accepts game-style version text without losing minor-version zeroes and allows clearing it', async () => {
        const {fixture, editor, root} = await setup({...rules, configurationVersion: 2});
        await fixture.whenStable();
        const field = root.querySelector<HTMLInputElement>('input[placeholder="e.g. 1.6"]')!;
        expect(field.type).toBe('text');
        expect(field.value).toBe('2');
        const save = vi.fn(); editor.save.subscribe(save);
        for (const version of ['1.6', '1.10', '1.6.1']) {
            field.value = version; field.dispatchEvent(new Event('input'));
            fixture.detectChanges();
            expect(editor.draft().configurationVersion).toBe(version);
            editor.submit(); expect(editor.validation).toEqual([]);
        }
        expect(save).toHaveBeenCalledTimes(3);
        field.value = ''; field.dispatchEvent(new Event('input')); fixture.detectChanges();
        expect(editor.draft().configurationVersion).toBeUndefined();
        editor.submit(); expect(editor.validation).toEqual([]);
    });
    it('opens General in the shared Story Guide shell and retains draft edits across tabs', async () => {
        const {fixture, editor, root} = await setup();
        expect(root.querySelector('.story-guide-dialog.patch-modal .section-editor-workspace')).not.toBeNull();
        expect(root.querySelectorAll('.section-editor-sidebar button').length).toBe(7);
        expect(editor.tab).toBe('General');
        editor.draft().description = 'Shared rules';
        editor.select('Attributes'); editor.addAttribute();
        editor.draft().attributes![0].label = 'Faction';
        fixture.detectChanges();
        expect(root.querySelector('details summary')?.textContent).toContain('Faction');
        editor.select('General'); fixture.detectChanges();
        expect(editor.draft().description).toBe('Shared rules');
        expect(rules.description).toBeUndefined();
    });
    it('confirms dirty cancellation and blocks writes while busy', async () => {
        const {editor, fixture} = await setup();
        const dismissed = vi.fn(), save = vi.fn(); editor.dismissed.subscribe(dismissed); editor.save.subscribe(save);
        editor.draft().description = 'Unsaved'; editor.close();
        expect(editor.discard).toBe(true); expect(dismissed).not.toHaveBeenCalled();
        fixture.componentRef.setInput('busy', true); fixture.detectChanges();
        editor.submit(); editor.close(); expect(save).not.toHaveBeenCalled();
    });
    it('rejects duplicate attribute IDs and narrowing existing progression before emitting a save', async () => {
        const {editor} = await setup({...rules, progressionProfiles: [{id: 'standard', gameId: 'genshin', tracks: [{id: 'level', label: 'Level', type: 'level', minValue: 1, maxValue: 100, displayOrder: 0}]}]});
        const save = vi.fn(); editor.save.subscribe(save);
        editor.addAttribute(); editor.draft().attributes![0].label = 'Element';
        editor.draft().attributes!.push({...editor.draft().attributes![0]});
        editor.submit(); expect(editor.validation.length).toBeGreaterThan(0); expect(save).not.toHaveBeenCalled();
        editor.draft().attributes!.pop();
        editor.draft().progressionProfiles![0].tracks[0].maxValue = 50;
        editor.submit(); expect(editor.validation.join(' ')).toContain('migration'); expect(save).not.toHaveBeenCalled();
    });
    it('saves valid node tracks and reorders attributes without changing IDs', async () => {
        const {editor, fixture, root} = await setup();
        const save = vi.fn(); editor.save.subscribe(save);
        editor.addAttribute(); editor.addAttribute();
        editor.draft().attributes!.forEach((attribute, index) => { attribute.label = `Attribute ${index}`; });
        const ids = editor.draft().attributes!.map(attribute => attribute.id);
        editor.move(editor.draft().attributes!, 1, -1);
        expect(editor.draft().attributes!.map(attribute => attribute.id)).toEqual(ids.reverse());
        editor.addProfile(); const profile = editor.draft().progressionProfiles![0];
        editor.addTrack(profile); profile.tracks[0].label = 'Passive'; editor.setType(profile.tracks[0], 'unlock');
        expect(profile.tracks[0].maxValue).toBeUndefined();
        editor.submit(); expect(save).toHaveBeenCalledOnce();
        fixture.componentRef.setInput('error', 'Save failed'); fixture.detectChanges();
        expect(root.querySelector('[role="alert"]')?.textContent).toContain('Save failed');
        expect(profile.tracks[0].label).toBe('Passive');
    });
    it('opens legacy fields without registering unnamed form controls', async () => {
        const {editor, fixture, root} = await setup({...rules, equipmentSlots: [{id:'weapon', label:'Weapon', limit:1}]});
        editor.select('Progression'); fixture.detectChanges(); await fixture.whenStable();
        expect(root.textContent).toContain('Equipment slots');
        expect(root.querySelector('.character-editor-row select')).not.toBeNull();
    });
});
