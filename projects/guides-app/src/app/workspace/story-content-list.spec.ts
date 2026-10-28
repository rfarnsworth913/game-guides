import { TestBed } from '@angular/core/testing';
import { StoryContentList } from './story-content-list';
import { Entry } from './workspace.store';
import { emptyPatchOverview, PatchOverview } from '../../../../common/story-template';
import { StoryTrackingMode } from '../../../../common/enums/story-tracking.enum';
import { storyProgress } from './story-progress';

describe('Unified story reading view', () => {
    const base: Entry = { id: 'existing', game: 'genshin', kind: 'story', category: 'main-story', name: 'Existing guide',
        notes: '', order: 0, day: '', rarity: 1, members: [], requirements: [], completed: false, quantity: 0, target: 0 };
    function setup(category = 'main-story') {
        const data: PatchOverview = { ...emptyPatchOverview(), patchVersion: '1.0', groups: [{ id: 'area', title: 'Existing area' }], rows: [
            { id: 'heading', rowType: 'heading' as const, groupId: 'area', content: 'Quest chain', contentType: '', patch: '', notes: '' },
            { id: 'done', groupId: 'area', content: 'First quest', contentUrl: 'https://example.com/quest', contentType: '', patch: '1.0', notes: '* First **note**', notesRight: 'Right note' },
            { id: 'next', groupId: 'area', subQuest: true, content: 'Second quest', contentType: '', patch: '1.1', notes: '' },
        ] };
        const entry = { ...base, category, mainStory: data, storyRowCompletion: { done: true } };
        const fixture = TestBed.createComponent(StoryContentList);
        fixture.componentRef.setInput('entry', entry);
        fixture.componentRef.setInput('data', data);
        fixture.detectChanges();
        return { fixture, data, entry, root: fixture.nativeElement as HTMLElement };
    }
    it('preserves row anchors, Markdown, split notes and sub-quest hierarchy without giving headings checkboxes', () => {
        const { fixture, data, root } = setup();
        expect(root.querySelectorAll('input[type="checkbox"]').length).toBe(2);
        expect(root.querySelector('#story-row-existing-heading input')).toBeNull();
        expect(root.querySelector('#story-row-existing-done .notes-markdown li strong')?.textContent).toBe('note');
        expect(root.querySelector('.guide-split-notes')?.textContent).toContain('Right note');
        expect(root.querySelector('#story-row-existing-next.guide-subquest')).toBeNull();
        expect(root.querySelector('#story-row-existing-done .guide-patch-badge')).toBeNull();
        expect(root.querySelector('#story-row-existing-next .guide-patch-badge')?.textContent).toBe('Patch 1.1');
        const toggled = vi.fn();
        fixture.componentInstance.toggled.subscribe(toggled);
        root.querySelector<HTMLInputElement>('#story-row-existing-next input')!.click();
        expect(toggled).toHaveBeenCalledWith(data.rows[2]);
        expect(data.rows.map(row => row.id)).toEqual(['heading', 'done', 'next']);
    });
    it('uses consumption labels without a local search and preserves incomplete filtering and reveal behavior', () => {
        const { fixture, root, data } = setup('lore');
        expect(root.querySelector('input[type="checkbox"]')?.getAttribute('aria-label')).toBe('Read: First quest');
        expect(root.querySelector('input[type="search"]')).toBeNull();
        fixture.componentInstance.collapsed.set(['area']);
        document.dispatchEvent(new CustomEvent('story-guide-reveal', { detail: 'story-row-existing-done' }));
        fixture.detectChanges();
        expect(fixture.componentInstance.collapsed()).toEqual([]);
        expect(root.querySelector('#story-row-existing-next')).not.toBeNull();
        expect(data.rows.length).toBe(3);
        fixture.componentRef.setInput('incompleteOnly', true);
        fixture.detectChanges();
        expect(root.querySelector('#story-row-existing-done')).toBeNull();
    });
    it('shows cycle-specific stages and keeps progress consistent with dashboard counts', () => {
        const { fixture, data, entry, root } = setup('endgame-activity');
        data.context = { trackingMode: StoryTrackingMode.Recurring, cycleId: 'cycle-2' };
        const activity = { ...entry, eventStory: structuredClone(data), storyRowCompletion: { done: true, 'cycle:cycle-1:next': true } };
        fixture.componentRef.setInput('entry', activity);
        fixture.componentRef.setInput('data', activity.eventStory);
        fixture.detectChanges();
        expect(root.querySelector('.guide-activity')).not.toBeNull();
        expect(fixture.componentInstance.completed()).toBe(0);
        expect(storyProgress([activity])).toEqual({ total: 2, completed: 0, percent: 0 });
    });
    it('collapses without discarding rows and removes hidden content from keyboard navigation', () => {
        const { fixture, root, data } = setup();
        const button = root.querySelector<HTMLButtonElement>('.guide-section-heading button')!;
        const content = root.querySelector<HTMLElement>('.guide-section-content')!;
        button.click();
        fixture.detectChanges();
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(content.classList.contains('collapsed')).toBe(true);
        expect(content.hasAttribute('inert')).toBe(true);
        expect(content.getAttribute('aria-hidden')).toBe('true');
        expect(root.querySelectorAll('.guide-content-row').length).toBe(3);
        button.click();
        fixture.detectChanges();
        expect(button.getAttribute('aria-expanded')).toBe('true');
        expect(content.hasAttribute('inert')).toBe(false);
        expect(data.rows[1].notesRight).toBe('Right note');
    });
    it('links the main quest heading independently from collapse controls and tracks only its quests', () => {
        const { fixture, data, root, entry } = setup();
        const parent = { id: 'parent', contentType: '', content: 'Everwinter Without Mercy', contentUrl: 'https://example.com/main', patch: '', notes: '* Parent note' };
        const migrated = { ...data, groups: [{ id: 'area', title: parent.content, mainQuest: parent }] };
        fixture.componentRef.setInput('data', migrated);
        fixture.componentRef.setInput('entry', { ...entry, mainStory: migrated });
        fixture.detectChanges();
        expect(root.querySelector('.guide-main-quest-heading h4 a')?.getAttribute('href')).toBe(parent.contentUrl);
        expect(root.querySelector('#story-row-existing-parent input')).toBeNull();
        expect(root.querySelector('.guide-main-quest-details li')?.textContent).toBe('Parent note');
        expect(root.querySelectorAll('input[type="checkbox"]').length).toBe(2);
        expect(root.querySelector('.guide-main-quest-progress strong')?.textContent).toBe('1 / 2');
        expect(root.querySelector('.guide-main-quest-progress small')?.textContent).toBe('50%');
        expect(root.querySelector('.guide-main-quest-title p > span')?.textContent).toBe('Archon Quest');
        expect(root.querySelector('.guide-main-quest-title .guide-patch-badge')?.textContent).toBe('Patch 1.0');
        fixture.componentRef.setInput('incompleteOnly', true);
        fixture.detectChanges();
        expect(root.querySelector('.guide-main-quest-progress strong')?.textContent).toBe('1 / 2');
        root.querySelector<HTMLButtonElement>('.guide-main-quest-heading button')!.click();
        fixture.detectChanges();
        expect(root.querySelector('.guide-section-content')?.hasAttribute('inert')).toBe(true);
    });
    it.each([['genshin', 'Story Quest'], ['endfield', 'Operator Mission'], ['zzz', 'Agent Story']])('renders %s character quests with the narrative header and correct terminology', (game, name) => {
        const { fixture, data, entry, root } = setup('side-stories');
        const parent = { id: 'character-quest', contentType: '', content: 'Character chapter', contentUrl: 'https://example.com/character-story', patch: '1.0', notes: '' };
        const story = { ...data, groups: [{ id: 'area', title: parent.content, mainQuest: parent }] };
        fixture.componentRef.setInput('data', story);
        fixture.componentRef.setInput('entry', { ...entry, game, sideStories: story });
        fixture.detectChanges();
        expect(root.querySelector('.guide-main-quest-title p > span')?.textContent).toBe(name);
        expect(root.querySelector('.guide-main-quest-title .guide-patch-badge')?.textContent).toBe('Patch 1.0');
        expect(root.querySelector('.guide-main-quest-heading h4 a')?.getAttribute('href')).toBe(parent.contentUrl);
        expect(root.querySelector('.guide-main-quest-progress strong')?.textContent).toBe('1 / 2');
        expect(root.querySelector('.guide-main-quest-progress small')?.textContent).toBe('50%');
        expect(root.querySelector('.guide-subquest')).toBeNull();
        expect(root.querySelector('#story-row-existing-character-quest input')).toBeNull();
    });
});
