import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { StoryContentList } from './story-content-list';
import { StoryContextEditor } from './story-context-editor';
import { PatchOverviewTemplate } from './patch-overview';
import { Entry, WorkspaceStore } from './workspace.store';
import { emptyPatchOverview, validPatchOverview, type PatchOverview, type StoryTableRow } from '../../../../common/story-template';
import { validStoryContext } from '../../../../common/story-guide';
import { StoryRequirementType } from '../../../../common/enums/story-tracking.enum';
import { worldQuestGroups, worldQuestObjectives, worldQuestPrerequisites } from '../../../../common/world-quest';
import { storyProgress } from './story-progress';
import { searchStoryGuides } from './story-search';

describe('World Quest hierarchy', () => {
    const row = (id: string, extra: Partial<StoryTableRow> = {}): StoryTableRow => ({ id, groupId: 'region', content: id, contentType: '', patch: '1.0', notes: '', ...extra });
    const fixtureData = (): PatchOverview => ({ ...emptyPatchOverview(), groups: [
        { id: 'region', title: 'Region', defaultPatch: '9.9' },
        { id: 'chain', title: 'Quest chain', worldQuestMode: 'questChain', objectiveIds: ['first', 'second'] },
    ], rows: [
        row('heading', { rowType: 'heading', content: 'first' }),
        row('first', { context: { prerequisites: [] }, notes: 'Useful **advice**' }),
        row('chapter', { rowType: 'heading', content: 'A meaningful chapter' }),
        row('second', { patch: '1.1', context: { chapter: 'Chapter One', subtype: 'dailyGated', prerequisites: [{ type: StoryRequirementType.Prerequisite, text: 'A verified gate' }] } }),
        row('third', { patch: '' }),
    ] });
    const entryFor = (data: PatchOverview): Entry => ({ id: 'guide', game: 'genshin', kind: 'story', category: 'world-quests', name: 'World quests',
        notes: '', order: 0, day: '', rarity: 1, members: [], requirements: [], completed: false, quantity: 0, target: 0,
        worldQuests: data, storyRowCompletion: { first: true } });
    function setup() {
        const data = fixtureData();
        const fixture = TestBed.createComponent(StoryContentList);
        fixture.componentRef.setInput('data', data);
        fixture.componentRef.setInput('entry', entryFor(data));
        fixture.detectChanges();
        return { fixture, data, root: fixture.nativeElement as HTMLElement };
    }
    it('adapts legacy headings without mutating content, IDs or release versions', () => {
        const data = fixtureData();
        const before = structuredClone(data);
        const groups = worldQuestGroups(data);
        expect(groups[0].sections[0].title).toBe('');
        expect(groups[0].sections[0].heading?.id).toBe('heading');
        expect(groups[0].sections[1].title).toBe('A meaningful chapter');
        expect(groups[1].mode).toBe('questChain');
        expect(groups[1].sections.some(section => section.title === 'Chapter One')).toBe(true);
        expect(groups[1].rows[0]).toBe(data.rows[1]);
        expect(data).toEqual(before);
        expect(worldQuestObjectives([...groups[0].rows, ...groups[1].rows])).toHaveLength(3);
    });
    it('shows compact requirements and initially collapsed notes beneath the quest title', () => {
        const { root, fixture } = setup();
        expect(root.querySelectorAll('.guide-content-row input')).toHaveLength(5);
        expect(root.querySelectorAll('.guide-patch-badge')).toHaveLength(5);
        expect(root.querySelector('#story-row-guide-first .guide-patch-badge')?.textContent).toBe('Patch 1.0');
        expect(root.querySelector('#story-row-guide-second .guide-patch-badge')?.textContent).toBe('Patch 1.1');
        expect(root.querySelector('#story-row-guide-third .guide-patch-badge')?.textContent).toBe('Patch unknown');
        expect(root.querySelectorAll('.guide-objective-requirements')).toHaveLength(4);
        expect(root.querySelector('#story-row-guide-first .guide-objective-requirements')?.textContent).toContain('Requirements: None');
        expect(root.querySelector('#story-row-guide-third .guide-objective-requirements')).toBeNull();
        expect(root.querySelector('#story-row-guide-second .guide-objective-requirements')?.textContent).toContain('A verified gate');
        expect(root.querySelector('#story-row-guide-first .guide-objective-notes strong')?.textContent).toBe('advice');
        const notes = root.querySelector('#story-row-guide-first .guide-row-main > .guide-objective-notes')!;
        const toggle = notes.querySelector<HTMLButtonElement>('button')!;
        const panel = notes.querySelector<HTMLElement>('.guide-section-content')!;
        expect(toggle.textContent?.trim()).toBe('Notes');
        expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(panel.hasAttribute('inert')).toBe(true);
        toggle.click();
        fixture.detectChanges();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(toggle.querySelector('svg')?.classList.contains('expanded')).toBe(true);
        expect(panel.classList.contains('collapsed')).toBe(false);
        expect(panel.hasAttribute('inert')).toBe(false);
        expect(root.querySelector('#story-row-guide-first-membership-chain .guide-notes-toggle')?.getAttribute('aria-expanded')).toBe('false');
        expect(notes.querySelector('.notes-markdown strong')?.textContent).toBe('advice');
        toggle.click();
        fixture.detectChanges();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(panel.classList.contains('collapsed')).toBe(true);
        expect(panel.getAttribute('aria-hidden')).toBe('true');
        expect(panel.hasAttribute('inert')).toBe(true);
        expect(root.querySelector('.guide-row-with-notes')).toBeNull();
        expect(root.querySelector('.guide-objective-notes svg')).not.toBeNull();
        expect(root.querySelector('.guide-objective-details details')).toBeNull();
        expect(root.querySelector('#story-row-guide-third .guide-objective-notes')).toBeNull();
        expect(root.querySelector('#story-row-guide-heading')).not.toBeNull();
        expect(root.querySelectorAll('[id]').length).toBe(new Set([...root.querySelectorAll('[id]')].map(element => element.id)).size);
    });
    it('keeps canonical completion synchronized across memberships and dashboard counts', () => {
        const { fixture, root, data } = setup();
        fixture.componentInstance.toggled.subscribe(objective => {
            fixture.componentRef.setInput('entry', { ...entryFor(data), storyRowCompletion: { first: true, [objective.id]: true } });
        });
        root.querySelector<HTMLInputElement>('#story-row-guide-second-membership-chain input')!.click();
        fixture.detectChanges();
        expect(root.querySelector<HTMLInputElement>('#story-row-guide-second input')!.checked).toBe(true);
        expect(root.querySelector<HTMLInputElement>('#story-row-guide-second-membership-chain input')!.checked).toBe(true);
        expect(root.querySelector('#patch-group-guide-region > header button > span')?.textContent).toBe('2 / 3');
        expect(root.querySelector('#patch-group-guide-chain > header button > span')?.textContent).toBe('2 / 2');
        expect(root.querySelector('#patch-group-guide-region .guide-secondary-heading button > span')?.textContent).toBe('1 / 2');
        expect(fixture.componentInstance.count(data.rows)).toBe(3);
        expect(storyProgress([fixture.componentInstance.entry()])).toEqual({ total: 3, completed: 2, percent: 67 });
        fixture.componentRef.setInput('incompleteOnly', true);
        fixture.detectChanges();
        expect(root.querySelector('#story-row-guide-second')).toBeNull();
        expect(root.querySelector('#story-row-guide-third')).not.toBeNull();
    });
    it('keeps checkboxes and counters on saved progress when a save fails, then updates both after retry', async () => {
        const save = vi.fn(async (_entry: Entry) => false);
        const error = signal('Could not sync account progress.');
        TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: { save, error, saving: () => false, loading: () => false } }] });
        const fixture = TestBed.createComponent(PatchOverviewTemplate);
        const data = fixtureData();
        fixture.componentRef.setInput('entry', entryFor(data));
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        const checkbox = root.querySelector<HTMLInputElement>('#story-row-guide-second input')!;
        checkbox.click();
        expect(checkbox.checked).toBe(false);
        await fixture.whenStable();
        fixture.detectChanges();
        expect(checkbox.checked).toBe(false);
        expect(root.querySelector('#patch-group-guide-region > header button > span')?.textContent).toBe('1 / 3');
        expect(root.querySelector('[role="alert"]')?.textContent).toBe('Could not sync account progress.');
        save.mockImplementationOnce(async updated => {
            fixture.componentRef.setInput('entry', updated);
            return true;
        });
        checkbox.click();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(checkbox.checked).toBe(true);
        expect(root.querySelector<HTMLInputElement>('#story-row-guide-second-membership-chain input')?.checked).toBe(true);
        expect(root.querySelector('#patch-group-guide-region > header button > span')?.textContent).toBe('2 / 3');
        expect(root.querySelector('#patch-group-guide-region .guide-secondary-heading button > span')?.textContent).toBe('1 / 2');
        expect(root.querySelector('[role="alert"]')).toBeNull();
        save.mockRejectedValueOnce(new Error('Network unavailable.'));
        checkbox.click();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(checkbox.checked).toBe(true);
        expect(root.querySelector('#patch-group-guide-region > header button > span')?.textContent).toBe('2 / 3');
        expect(root.querySelector('[role="alert"]')?.textContent).toBe('Network unavailable.');
    });
    it('links secondary headings independently of collapse and retains linked single-objective headings', () => {
        const { fixture, root, data } = setup();
        const changed = structuredClone(data);
        changed.rows[0].contentUrl = 'https://example.com/quest-chain';
        fixture.componentRef.setInput('data', changed);
        fixture.detectChanges();
        const header = root.querySelector('.guide-linked-secondary-heading')!;
        const link = header.querySelector<HTMLAnchorElement>('h5 a')!;
        const toggle = header.querySelector<HTMLButtonElement>('button')!;
        expect(link.textContent).toContain('first');
        expect(link.getAttribute('href')).toBe('https://example.com/quest-chain');
        expect(link.target).toBe('_blank');
        expect(link.rel).toBe('noopener noreferrer');
        expect(link.closest('button')).toBeNull();
        link.addEventListener('click', event => event.preventDefault());
        link.click();
        fixture.detectChanges();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        toggle.click();
        fixture.detectChanges();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(root.querySelectorAll('input[type="checkbox"]')).toHaveLength(5);
        changed.rows[0].contentUrl = 'javascript:alert(1)';
        expect(validPatchOverview(changed)).toBe(false);
        fixture.componentRef.setInput('data', structuredClone(changed));
        fixture.detectChanges();
        expect(root.querySelector('.guide-linked-secondary-heading')).toBeNull();
    });
    it('collapses groups independently, retains visible requirements and reveals search anchors', () => {
        const { fixture, root } = setup();
        const requirements = root.querySelector('.guide-objective-requirements')!;
        const secondary = root.querySelector<HTMLButtonElement>('.guide-secondary-heading button')!;
        secondary.click();
        root.querySelector<HTMLButtonElement>('.guide-section-heading button')!.click();
        fixture.detectChanges();
        expect(secondary.getAttribute('aria-expanded')).toBe('false');
        expect(root.querySelector('.guide-section-content')?.hasAttribute('inert')).toBe(true);
        expect(requirements.textContent).toContain('Requirements: None');
        document.dispatchEvent(new CustomEvent('story-guide-reveal', { detail: 'story-row-guide-second' }));
        fixture.detectChanges();
        expect(secondary.getAttribute('aria-expanded')).toBe('true');
        expect(root.querySelector('.guide-section-content')?.hasAttribute('inert')).toBe(false);
    });
    it('does not infer gates from notes and distinguishes unknown from explicitly empty prerequisites', () => {
        expect(worldQuestPrerequisites()).toBeNull();
        expect(worldQuestPrerequisites({ requirements: [] })).toBeNull();
        expect(worldQuestPrerequisites({ requirements: [{ type: StoryRequirementType.Recommendation, text: 'Do this first' }] })).toBeNull();
        const gate = { type: StoryRequirementType.Unlock, text: 'Verified gate' };
        expect(worldQuestPrerequisites({ requirements: [gate] })).toEqual([gate]);
        expect(worldQuestPrerequisites({ requirements: [gate], prerequisites: [] })).toEqual([]);
        expect(worldQuestPrerequisites({ requirements: [gate], prerequisites: null })).toBeNull();
    });
    it('renders multiple linked prerequisites with any/all semantics and preserves advice separately', () => {
        const { fixture, root, data } = setup();
        const target = { ...entryFor(data), id: 'required-entry', name: 'Previous quest', storySection: 'chapter' };
        const changed = structuredClone(data);
        changed.rows[1].context = { requirementsOperator: 'anyOf', prerequisites: [
            { type: StoryRequirementType.Prerequisite, text: 'Finish the previous quest', targetId: target.id },
            { type: StoryRequirementType.TimeGate, text: 'Wait for reset' },
        ] };
        fixture.componentRef.setInput('data', changed);
        fixture.componentRef.setInput('relatedEntries', [target, { ...target, game: 'hsr' }]);
        fixture.detectChanges();
        const requirements = root.querySelector('#story-row-guide-first .guide-objective-requirements')!;
        expect(requirements.textContent).toContain('Meet any');
        expect(requirements.querySelectorAll('li')).toHaveLength(2);
        expect(requirements.querySelector('a')?.getAttribute('href')).toContain('/games/genshin/story?section=chapter#story-content-required-entry');
    });
    it('validates additive metadata and rejects dangling memberships and malformed gates', () => {
        const data = fixtureData();
        expect(validPatchOverview(data)).toBe(true);
        expect(validPatchOverview({ ...data, groups: [{ id: 'region', title: 'Region', objectiveIds: ['missing'] }] })).toBe(false);
        expect(validPatchOverview({ ...data, groups: [{ id: 'region', title: 'Region', objectiveIds: ['first', 'first'] }] })).toBe(false);
        expect(validPatchOverview({ ...data, rows: {}, groups: [{ id: 'region', title: 'Region', objectiveIds: ['first'] }] })).toBe(false);
        expect(validStoryContext({ prerequisites: null })).toBe(true);
        expect(validStoryContext({ prerequisites: [], requirementsOperator: 'allOf' })).toBe(true);
        expect(validStoryContext({ prerequisites: [{ type: 'made-up', text: 'x' }] })).toBe(false);
        expect(validStoryContext({ requirementsOperator: 'arbitrary' })).toBe(false);
    });
    it('keeps requirement edits local and preserves legacy information', () => {
        const fixture = TestBed.createComponent(StoryContextEditor);
        const context = { requirements: [{ type: StoryRequirementType.Unlock, text: 'Verified legacy gate' }] };
        fixture.componentRef.setInput('context', context);
        fixture.componentRef.setInput('worldQuest', true);
        fixture.componentRef.setInput('row', true);
        fixture.detectChanges();
        fixture.componentInstance.setPrerequisite(0, 'text', 'New draft');
        expect(context.requirements[0].text).toBe('Verified legacy gate');
        expect(fixture.componentInstance.prerequisites()?.[0].text).toBe('New draft');
        fixture.componentInstance.setRequirementStatus('none');
        expect(fixture.componentInstance.prerequisites()).toEqual([]);
        fixture.componentInstance.setRequirementStatus('unknown');
        expect(fixture.componentInstance.prerequisites()).toBeNull();
        fixture.componentInstance.setRequirementStatus('documented');
        fixture.componentInstance.removePrerequisite(0);
        expect(fixture.componentInstance.prerequisites()).toBeNull();
    });
    it('finds memberships and requirement metadata while retaining canonical search and resume targets', () => {
        const entry = { ...entryFor(fixtureData()), storySection: 'navigation' };
        const section = { ...entry, id: 'navigation', kind: 'story-category' as const, name: 'Navigation' };
        const result = searchStoryGuides([section, entry], 'genshin', 'Quest chain');
        expect(result.map(item => item.target)).toEqual(['story-row-guide-first', 'story-row-guide-second']);
        expect(searchStoryGuides([section, entry], 'hsr', 'Quest chain')).toEqual([]);
        const changed = { ...emptyPatchOverview(), groups: [{ id: 'region', title: 'Region' }], rows: [
            row('one', { context: { area: 'Named area' } }), row('two'),
        ] };
        expect(worldQuestGroups(changed)[0].sections.map(section => section.title)).toEqual(['Named area', '']);
    });
    it('cleans references when an editor removes an objective without saving private progress', () => {
        const save = vi.fn();
        TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: { save } }] });
        const fixture = TestBed.createComponent(PatchOverviewTemplate);
        fixture.componentRef.setInput('entry', entryFor(fixtureData()));
        fixture.componentRef.setInput('editing', true);
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        expect(root.textContent).toContain('Organize by');
        expect(root.textContent).toContain('Include existing objectives');
        expect(root.textContent).toContain('Secondary Heading Link');
        fixture.componentInstance.removeRow('first');
        expect(fixture.componentInstance.data().groups?.[1].objectiveIds).toEqual(['second']);
        expect(validPatchOverview(fixture.componentInstance.data())).toBe(true);
        expect(save).not.toHaveBeenCalled();
    });
});
