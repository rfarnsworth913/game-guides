import { TestBed } from '@angular/core/testing';
import { RequirementPicker } from './requirement-picker';
import { StoryContextEditor } from './story-context-editor';
import { StoryContentList } from '../content-list/story-content-list';
import { storyRequirementLinks } from '../../utils/story-requirement-links';
import { emptyPatchOverview } from '@common/quests/story-template';
import { validStoryContext } from '@common/quests/story-guide';
import { StoryAvailability, StoryRequirementType, StoryTrackingMode } from '@lib/enums/story-tracking.enum';
import type { Entry } from '../../../../../core/state/workspace.store';
import type { StoryContext } from '@lib/types/story-context.type';

describe('Requirement title search', () => {
    const entry: Entry = { id: 'guide', game: 'genshin', kind: 'story', category: 'world-quests', name: 'The Frozen Coast', storySection: 'chapter',
        notes: '', order: 0, day: '', rarity: 1, members: [], requirements: [], completed: false, quantity: 0, target: 0,
        worldQuests: { ...emptyPatchOverview(), rows: [
            { id: 'first', content: 'A Sprout Without a Gardener', groupId: 'chain', contentType: '', patch: '', notes: '' },
            { id: 'second', content: 'A Sprout of Hope', groupId: 'chain', contentType: '', patch: '', notes: '' },
            { id: 'heading', content: 'Hidden heading', rowType: 'heading', groupId: 'chain', contentType: '', patch: '', notes: '' },
        ], groups: [{ id: 'chain', title: 'An Ark That Used to Be a Soul' }] },
    };
    const entries = () => [structuredClone(entry), { ...entry, id: 'other-game', game: 'hsr', name: 'Sprout in another game' }, { ...entry, id: 'divider', category: 'divider', name: '' }];
    function setup(value = '') {
        const fixture = TestBed.createComponent(RequirementPicker);
        fixture.componentRef.setInput('game', 'genshin');
        fixture.componentRef.setInput('entries', entries());
        fixture.componentRef.setInput('value', value);
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        return { fixture, component: fixture.componentInstance, root, input: root.querySelector<HTMLInputElement>('input')! };
    }
    function search(input: HTMLInputElement, text: string): void {input.value = text; input.dispatchEvent(new Event('input'));}

    it('searches English titles and parent context in this game and selects stable row references', () => {
        const { fixture, component, input, root } = setup();
        search(input, 'GARDENER frozen');
        fixture.detectChanges();
        const options = root.querySelectorAll<HTMLButtonElement>('[role="option"]');
        expect(options).toHaveLength(1);
        expect(options[0].textContent).toContain('A Sprout Without a Gardener');
        expect(options[0].textContent).toContain('The Frozen Coast');
        options[0].click();
        fixture.detectChanges();
        expect(component.value()).toBe('quest:guide:first');
        expect(validStoryContext({ prerequisites: [{ type: StoryRequirementType.Prerequisite, text: 'Finish the quest', targetId: component.value() }] })).toBe(true);
        expect(root.querySelector('[role="listbox"]')).toBeNull();
        expect(root.querySelector('.requirement-selected')?.textContent).toContain('A Sprout Without a Gardener');
        expect(component.links().some(link => link.name === 'Hidden heading' || link.id.includes('other-game') || link.id === 'divider')).toBe(false);
    });
    it('supports keyboard selection, Escape, outside clicks and explicit removal', () => {
        const { fixture, component, input, root } = setup();
        search(input, 'sprout'); fixture.detectChanges();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); fixture.detectChanges();
        expect(input.getAttribute('aria-activedescendant')).toBe(component.listId + '-1');
        const expected = component.matches()[1].id;
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); fixture.detectChanges();
        expect(component.value()).toBe(expected);
        input.dispatchEvent(new FocusEvent('focus')); fixture.detectChanges();
        const escaped = vi.fn(); root.addEventListener('keydown', escaped);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); fixture.detectChanges();
        expect(escaped).not.toHaveBeenCalled(); expect(component.open()).toBe(false);
        input.dispatchEvent(new FocusEvent('focus')); fixture.detectChanges();
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); fixture.detectChanges();
        expect(component.open()).toBe(false); expect(component.value()).toBe(expected);
        root.querySelector<HTMLButtonElement>('[aria-label="Remove linked requirement"]')!.click(); fixture.detectChanges();
        expect(component.value()).toBe('');
    });
    it('finds and links main story quest headers with long persisted identifiers, then renders them as another quest prerequisite', () => {
        const id='main-'+ 'a'.repeat(90), rowId='parent-'+ 'b'.repeat(80);
        const main:Entry={...structuredClone(entry),id,category:'main-story',name:'Lost in the Marsh',worldQuests:globalThis.undefined,mainStory:{...emptyPatchOverview(),groups:[{id:'main-group',title:'Cradle of Ages',mainQuest:{id:rowId,content:'Cradle of Ages',contentType:'',patch:'1.0',notes:''}}],rows:[]}};
        const before=structuredClone(main);
        const {fixture,component,input,root}=setup();
        fixture.componentRef.setInput('entries',[...entries(),main,{...main,id:'foreign',game:'hsr'}]);
        search(input,'cradle ages');fixture.detectChanges();
        const option=root.querySelector<HTMLButtonElement>('[role="option"]')!;
        expect(option.textContent).toContain('Cradle of Ages');expect(option.textContent).toContain('Main story quest');
        option.click();fixture.detectChanges();
        const link=component.selected()!;
        expect(link.id.length).toBeGreaterThan(100);
        expect(link.url).toBe(`/games/genshin/story?section=chapter#story-row-${id}-${rowId}`);
        const context:StoryContext={prerequisites:[{type:StoryRequirementType.Prerequisite,text:'Complete the main quest',targetId:link.id}]};
        expect(validStoryContext(context)).toBe(true);
        const reader=TestBed.createComponent(StoryContentList), data=structuredClone(entry.worldQuests!);
        data.rows[0].context=context;
        reader.componentRef.setInput('entry',entry);reader.componentRef.setInput('data',data);reader.componentRef.setInput('relatedEntries',[entry,main]);reader.detectChanges();
        const rendered=(reader.nativeElement as HTMLElement).querySelector('#story-row-guide-first .guide-objective-requirements a');
        expect(rendered?.textContent).toBe('Cradle of Ages');expect(rendered?.getAttribute('href')).toBe(link.url);
        expect(main).toEqual(before);
    });
    it('uses the displayed group title when a main quest header has no separate content title', () => {
        const main:Entry={...entry,category:'main-story',mainStory:{...emptyPatchOverview(),groups:[{id:'group',title:'Everwinter Without Mercy',mainQuest:{id:'parent',content:'',contentType:'',patch:'',notes:''}}],rows:[]}};
        const link=storyRequirementLinks([main],'genshin').find(link=>link.id==='quest:guide:parent');
        expect(link?.name).toBe('Everwinter Without Mercy');
        expect(link?.url).toContain('#story-row-guide-parent');
    });
    it('preserves existing and unavailable references when typing, blurring or finding no matches', () => {
        const { fixture, component, input, root } = setup('old-reference');
        expect(root.textContent).toContain('Previously linked content (unavailable)');
        search(input, 'missing quest'); fixture.detectChanges();
        expect(root.textContent).toContain('No matching content in this game.');
        input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); fixture.detectChanges();
        expect(component.value()).toBe('old-reference'); expect(component.query()).toBe('');
    });
    it('removes the requested form fields without mutating stored metadata and keeps link edits in the local draft', () => {
        const fixture = TestBed.createComponent(StoryContextEditor);
        const context: StoryContext = { trackingMode: StoryTrackingMode.Recurring, region: 'Coast', area: 'Harbour', chain: 'Ark', chapter: 'Act I', cycleId: 'cycle-1', resetSchedule: 'Weekly',
            requirements: [{ type: StoryRequirementType.Unlock, text: 'Original gate', targetId: 'guide' }] };
        const before = structuredClone(context);
        const data = entries(); const catalog = structuredClone(data);
        fixture.componentRef.setInput('context', context); fixture.componentRef.setInput('entries', data); fixture.componentRef.setInput('game', 'genshin'); fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        const labels = [...root.querySelectorAll('label')].map(label => label.textContent);
        expect(labels.some(label => /Tracking mode|Region|Area|Quest chain|Chapter \/ act|Current cycle ID|Reset schedule/.test(label ?? ''))).toBe(false);
        expect(context).toEqual(before);
        search(root.querySelector<HTMLInputElement>('input[role="combobox"]')!, 'gardener'); fixture.detectChanges();
        root.querySelector<HTMLButtonElement>('[role="option"]')!.click(); fixture.detectChanges();
        expect(context.requirements?.[0].targetId).toBe('quest:guide:first');
        expect(context.requirements?.[0].text).toBe('Original gate');
        expect(data).toEqual(catalog); expect(context.cycleId).toBe(before.cycleId);
    });
    it('looks up quests directly from a new world quest requirement and renders the existing quest anchor', async () => {
        const links = storyRequirementLinks(entries(), 'genshin');
        const link = links.find(item => item.id === 'quest:guide:first')!;
        expect(link.url).toBe('/games/genshin/story?section=chapter#story-row-guide-first');
        const fixture = TestBed.createComponent(StoryContextEditor);
        const context: StoryContext = {};
        fixture.componentRef.setInput('context', context); fixture.componentRef.setInput('worldQuest', true); fixture.componentRef.setInput('row', true); fixture.componentRef.setInput('entries', entries()); fixture.componentRef.setInput('game', 'genshin'); fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        [...root.querySelectorAll('button')].find(button => button.textContent?.trim() === '+ Add requirement')!.click();
        fixture.detectChanges(); await fixture.whenStable();
        expect(root.querySelector('details.requirement-link-options')).toBeNull();
        const description = root.querySelector<HTMLTextAreaElement>('.guide-requirement-editor textarea')!;
        description.value = 'Complete the previous quest'; description.dispatchEvent(new Event('input')); fixture.detectChanges();
        search(root.querySelector<HTMLInputElement>('input[role="combobox"]')!, 'gardener'); fixture.detectChanges();
        root.querySelector<HTMLButtonElement>('[role="option"]')!.click(); fixture.detectChanges();
        expect(context.prerequisites?.[0].targetId).toBe(link.id);
        const reader = TestBed.createComponent(StoryContentList);
        const data = structuredClone(entry.worldQuests!); data.rows[1].context = context;
        reader.componentRef.setInput('entry', entry); reader.componentRef.setInput('data', data); reader.componentRef.setInput('relatedEntries', entries()); reader.detectChanges();
        const rendered = (reader.nativeElement as HTMLElement).querySelector('#story-row-guide-second .guide-objective-requirements a');
        expect(rendered?.textContent).toBe(link.name); expect(rendered?.getAttribute('href')).toBe(link.url);
        root.querySelector<HTMLButtonElement>('[aria-label="Remove linked requirement"]')!.click(); fixture.detectChanges();
        expect(context.prerequisites?.[0].targetId).toBe('');
        expect(context.prerequisites?.[0].text).toBe('Complete the previous quest');
    });
    it('shows row subtype and requirements inline, keeps availability and dates on the parent, and preserves hidden row data', async () => {
        const fixture = TestBed.createComponent(StoryContextEditor);
        const context: StoryContext = { availability: StoryAvailability.Limited, startDate: '2026-01-01', endDate: '2026-02-01', difficulty: 'Tier 3', subtype: 'Exploration',
            requirements: [{ type: StoryRequirementType.Prerequisite, text: 'Complete the previous quest', targetId: 'guide' }] };
        const before = structuredClone(context);
        fixture.componentRef.setInput('context', context); fixture.componentRef.setInput('game', 'genshin'); fixture.componentRef.setInput('entries', entries()); fixture.componentRef.setInput('row', true); fixture.detectChanges();
        await fixture.whenStable();
        const root = fixture.nativeElement as HTMLElement;
        expect(root.querySelector('details.guide-context-editor')).toBeNull();
        expect(root.querySelector('.guide-inline-context')).not.toBeNull();
        const labels = [...root.querySelectorAll('label')].map(label => label.textContent ?? '');
        expect(labels.some(label => /Availability|Start date|End date|Difficulty \/ tier/.test(label))).toBe(false);
        expect(labels.some(label => label.includes('Activity Sub-type'))).toBe(true);
        expect(root.querySelector('h4')?.textContent).toBe('Requirements');
        expect(root.querySelector('gg-requirement-picker')).not.toBeNull();
        expect(context).toEqual(before);
        const subtype = root.querySelector<HTMLInputElement>('label > input:not([role="combobox"])')!;
        subtype.value = 'Hidden Exploration Objective'; subtype.dispatchEvent(new Event('input')); fixture.detectChanges();
        expect(context.subtype).toBe('Hidden Exploration Objective'); expect(context.startDate).toBe(before.startDate); expect(context.endDate).toBe(before.endDate); expect(context.difficulty).toBe(before.difficulty);
        fixture.componentRef.setInput('row', false); fixture.detectChanges();
        expect(root.querySelector('details > summary')?.textContent).toBe('Guide details');
        const parentLabels = [...root.querySelectorAll('label')].map(label => label.textContent ?? '');
        expect(parentLabels.some(label => label.includes('Availability'))).toBe(true);
        expect(root.querySelectorAll('input[type="date"]')).toHaveLength(2);
        expect(parentLabels.some(label => label.includes('Activity Sub-type'))).toBe(false);
    });
    it('saves plain-text requirements without a link and keeps linking optional', async () => {
        const fixture = TestBed.createComponent(StoryContextEditor);
        const context: StoryContext = {};
        fixture.componentRef.setInput('context', context); fixture.componentRef.setInput('row', true); fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        [...root.querySelectorAll('button')].find(button => button.textContent?.trim() === '+ Add requirement')!.click();
        fixture.detectChanges(); await fixture.whenStable();
        const description = root.querySelector<HTMLTextAreaElement>('.guide-requirement-editor textarea')!;
        description.value = 'Reach Adventure Rank 25'; description.dispatchEvent(new Event('input')); fixture.detectChanges();
        expect(context.requirements?.[0]).toEqual({ type: StoryRequirementType.Prerequisite, text: 'Reach Adventure Rank 25' });
        expect(validStoryContext(context)).toBe(true);
        expect(root.querySelector('details.requirement-link-options')).toBeNull();
        expect(root.querySelector('.requirement-link-options input[role="combobox"]')).not.toBeNull();
        expect(root.querySelector('h4')?.textContent).toBe('Requirements');
        root.querySelector<HTMLButtonElement>('[aria-label="Remove requirement"]')!.click(); fixture.detectChanges();
        expect(context.requirements).toEqual([]);
    });
});
