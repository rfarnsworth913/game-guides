import { TestBed } from '@angular/core/testing';
import { PatchOverviewTemplate } from './patch-overview';
import { Entry, WorkspaceStore } from './workspace.store';
import { emptyPatchOverview, trimPatchOverviewText, validPatchOverview } from '../../../../common/story-template';
import { reworkMainQuestTemplate } from '../../../../common/main-quest';

describe('Patch Overview grouped row editor', () => {
    it.each(['main-story', 'side-stories'])('allows regular cutscene groups within %s without creating or promoting a parent quest', category => {
        const save = vi.fn();
        TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: { save, saving: () => false, loading: () => false } }] });
        const fixture = TestBed.createComponent(PatchOverviewTemplate);
        const data = emptyPatchOverview();
        const entry: Entry = { id: 'draft', game: 'genshin', kind: 'story', category, name: 'Story', notes: '', rarity: 1, members: [], requirements: [], order: 0, day: '', completed: false, quantity: 0, target: 0,
            ...(category === 'side-stories' ? { sideStories: data } : { mainStory: data }) };
        fixture.componentRef.setInput('entry', entry);
        fixture.componentRef.setInput('editing', true);
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '+ Add Content Group')!.click();
        const component = fixture.componentInstance;
        const group = data.groups![0];
        group.title = 'Related Cutscenes';
        component.addRow(group.id);
        Object.assign(data.rows[0], { content: group.title, contentUrl: 'https://example.com/cutscene' });
        fixture.detectChanges();
        expect(group.groupType).toBe('content');
        expect(group.mainQuest).toBeUndefined();
        expect(root.textContent).toContain('Group Name');
        expect(root.textContent).toContain('+ Add Row');
        expect(root.textContent).not.toContain('Use as ');
        expect(validPatchOverview(data)).toBe(true);
        expect(reworkMainQuestTemplate(data, group.title).template).toEqual(data);
        fixture.componentRef.setInput('editing', false);
        fixture.detectChanges();
        expect(root.querySelector('.guide-main-quest-heading')).toBeNull();
        expect(root.querySelector('.guide-section-heading h4')?.textContent).toBe(group.title);
        expect(root.querySelector('.guide-row-title a')?.getAttribute('href')).toBe('https://example.com/cutscene');
        component.promoteMainQuest(data.rows[0]);
        expect(group.mainQuest).toBeUndefined();
        expect(data.rows).toHaveLength(1);
        expect(save).not.toHaveBeenCalled();
    });
    it.each([['main-story', 'Main Quest'], ['side-stories', 'Story Quest']])('edits linked %s headings and preserves parent data when promoting or removing a group', (category, label) => {
        const save = vi.fn();
        TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: { save } }] });
        const fixture = TestBed.createComponent(PatchOverviewTemplate);
        const parent = { id: 'parent', groupId: 'a', contentType: '', content: 'Main quest', contentUrl: 'https://example.com/main', patch: '', notes: 'Original parent notes' };
        const child = { ...parent, id: 'child', content: 'A quest', notes: 'Original quest notes' };
        const data = { ...emptyPatchOverview(), groups: [{ id: 'a', title: 'Main quest', mainQuest: parent }], rows: [child] };
        const entry: Entry = { id: 'draft', game: 'genshin', kind: 'story', category, name: 'Draft',
            notes: '', rarity: 0, members: [], requirements: [], order: 0, day: '', completed: false, quantity: 0, target: 0,
            ...(category === 'side-stories' ? { sideStories: data } : { mainStory: data }) };
        fixture.componentRef.setInput('entry', entry);
        fixture.componentRef.setInput('editing', true);
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        expect(root.textContent).toContain(label + ' Title');
        expect(root.textContent).toContain(label + ' Link');
        expect(root.querySelector('.row-flags')?.textContent).not.toContain('Sub-quest');
        fixture.componentInstance.promoteMainQuest(child);
        expect(data.groups[0].mainQuest.id).toBe('child');
        expect(data.rows[0]).toMatchObject({ id: 'parent', notes: 'Original parent notes' });
        fixture.componentInstance.removeGroup('a');
        expect(data.rows.map(row => row.id).sort()).toEqual(['child', 'parent']);
        expect(save).not.toHaveBeenCalled();
    });
    it('preserves collapsed drafts, inherits group patches and reorders rows without saving', () => {
        const save = vi.fn();
        TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: { save } }] });
        const fixture = TestBed.createComponent(PatchOverviewTemplate);
        const entry: Entry = { id: 'draft', game: 'genshin', kind: 'story', category: 'main-story',
            name: 'Draft', notes: '', rarity: 0, members: [], requirements: [], order: 0, day: '',
            completed: false, quantity: 0, target: 0,
            mainStory: { ...emptyPatchOverview(), groups: [{ id: 'a', title: 'A', defaultPatch: '1.1' }, { id: 'b', title: 'B' }] } };
        fixture.componentRef.setInput('entry', entry);
        fixture.componentRef.setInput('editing', true);
        const component = fixture.componentInstance;
        component.addRow('a');
        const first = component.data().rows[0];
        expect(first.patch).toBe('1.1');
        Object.assign(first, { notes: 'Long draft notes', notesRight: 'Split draft', patch: '1.2' });
        component.addRow('a');
        const second = component.data().rows[1];
        expect(component.expandedRow()).toBe(second.id);
        component.toggleRow({ preventDefault() {} } as Event, first.id);
        component.toggleRow({ preventDefault() {} } as Event, first.id);
        expect(component.expandedRow()).toBe('');
        expect(first).toMatchObject({ notes: 'Long draft notes', notesRight: 'Split draft', patch: '1.2' });
        component.addRow('b');
        const other = component.data().rows[2];
        component.draggingRow.set(second.id);
        component.rowDropAfter.set(false);
        component.dropRow({ preventDefault() {} } as DragEvent, first);
        expect(component.rowsForGroup('a').map((row) => row.id)).toEqual([second.id, first.id]);
        component.draggingRow.set(first.id);
        component.dropRow({ preventDefault() {} } as DragEvent, other);
        expect(component.rowsForGroup('a').map((row) => row.id)).toEqual([second.id, first.id]);
        expect(save).not.toHaveBeenCalled();
    });
    it('filters completed rows and empty groups while keeping global notes and headings', () => {
        TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: {} }] });
        const fixture = TestBed.createComponent(PatchOverviewTemplate);
        const row = { contentType: '', content: '', patch: '', notes: '' };
        fixture.componentRef.setInput('entry', {
            category: 'world-quests', storyRowCompletion: { done: true, finished: true },
            worldQuests: { ...emptyPatchOverview(), groups: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], rows: [
                { ...row, id: 'heading', groupId: 'a', rowType: 'heading' },
                { ...row, id: 'note', groupId: 'a', rowType: 'note' },
                { ...row, id: 'done', groupId: 'a' }, { ...row, id: 'pending', groupId: 'a' },
                { ...row, id: 'finished', groupId: 'b' },
            ] },
        });
        fixture.componentRef.setInput('incompleteOnly', true);
        expect(fixture.componentInstance.groups().map((group) => group.rows.map((row) => row.id))).toEqual([['heading', 'note', 'pending']]);
        fixture.componentRef.setInput('editing', true);
        expect(fixture.componentInstance.groups().length).toBe(2);
    });
    it.each(['patch-overview', 'main-story', 'side-stories', 'world-quests', 'lore', 'character-information', 'events'])('%s adds and reorders grouped rows without losing removed group content', (category) => {
        TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: {} }] });
        const fixture = TestBed.createComponent(PatchOverviewTemplate);
        const entry: Entry = {
            id: 'patch', game: 'endfield', kind: 'story', name: 'Patch', notes: '',
            category, rarity: 0, members: [], requirements: [], order: 0,
            day: '', completed: false, quantity: 0, target: 0,
            patchOverview: { ...emptyPatchOverview(), groups: [{ id: 'trailers', title: 'Trailers' }, { id: 'eps', title: 'EPs' }] },
        };
        if (category === 'main-story') {
            entry.mainStory = entry.patchOverview;
            delete entry.patchOverview;
        }
        if (category === 'lore') {
            entry.lore = entry.patchOverview;
            delete entry.patchOverview;
        }
        if (category === 'world-quests') {
            entry.worldQuests = entry.patchOverview;
            delete entry.patchOverview;
        }
        if (category === 'side-stories') {
            entry.sideStories = entry.patchOverview;
            delete entry.patchOverview;
        }
        if (category === 'character-information') {
            entry.characterInformation = entry.patchOverview;
            delete entry.patchOverview;
        }
        if (category === 'events') {
            entry.eventStory = entry.patchOverview;
            delete entry.patchOverview;
        }
        const data = entry.lore ?? entry.eventStory ?? entry.characterInformation ?? entry.sideStories ?? entry.worldQuests ?? entry.mainStory ?? entry.patchOverview!;
        fixture.componentRef.setInput('entry', entry);
        fixture.componentRef.setInput('editing', true);
        fixture.detectChanges();
        if (category === 'events') {
            expect(fixture.nativeElement.textContent).toContain('Events Banner');
            expect(fixture.nativeElement.textContent).not.toContain('Patch Details');
        }
        const groups = fixture.nativeElement.querySelectorAll('.patch-edit-group') as NodeListOf<HTMLElement>;
        expect(groups.length).toBe(2);
        (groups[1].querySelector('.patch-row-add button') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(data.rows[0].groupId).toBe('eps');
        expect(groups[0].querySelectorAll('.patch-row-editor').length).toBe(0);
        expect(groups[1].querySelectorAll('.patch-row-editor').length).toBe(1);
        const component = fixture.componentInstance;
        const first = data.rows[0];
        (groups[0].querySelector('.patch-row-add button') as HTMLButtonElement).click();
        fixture.detectChanges();
        (groups[1].querySelector('.patch-row-add button') as HTMLButtonElement).click();
        const last = data.rows[2];
        fixture.changeDetectorRef.markForCheck();
        fixture.detectChanges();
        const up = groups[1].querySelector('[aria-label="Move row 2 up"]') as HTMLButtonElement;
        up.click();
        expect(component.rowsForGroup('eps').map((row) => row.id)).toEqual([last.id, first.id]);
        component.removeGroup('eps');
        fixture.changeDetectorRef.markForCheck();
        fixture.detectChanges();
        expect(component.rowsForGroup('').map((row) => row.id)).toEqual([last.id, first.id]);
        expect(fixture.nativeElement.textContent).toContain('Overview (ungrouped)');
        expect(data.rows.length).toBe(3);
    });
});


describe('Story text formatting', () => {
    it('trims entered text while preserving internal whitespace and row identifiers', () => {
        const patch = {
            ...emptyPatchOverview(), imageUrl: '  https://example.com/banner.png  ',
            patchTitle: '  Patch Title  ', groups: [{ id: 'group', title: '  Trailers  ' }],
            rows: [{ id: 'row', groupId: 'group', contentType: '', content: '  First  line\nSecond line  ',
                contentUrl: ' https://example.com/video ', patch: ' 1.0 ', notes: ' note ', notesRight: '   ' }],
        };
        trimPatchOverviewText(patch);
        expect(patch.imageUrl).toBe('https://example.com/banner.png');
        expect(patch.patchTitle).toBe('Patch Title');
        expect(patch.groups[0]).toEqual({ id: 'group', title: 'Trailers' });
        expect(patch.rows[0]).toEqual({ id: 'row', groupId: 'group', contentType: '',
            content: 'First  line\nSecond line', contentUrl: 'https://example.com/video',
            patch: '1.0', notes: 'note', notesRight: '' });
    });
});
