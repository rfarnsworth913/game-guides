import { TestBed } from '@angular/core/testing';
import { PatchOverviewTemplate } from './patch-overview';
import { Entry, WorkspaceStore } from './workspace.store';
import { emptyPatchOverview, trimPatchOverviewText } from '../../../../common/story-template';

describe('Patch Overview grouped row editor', () => {
    it.each(['patch-overview', 'main-story', 'side-stories', 'world-quests'])('%s adds and reorders grouped rows without losing removed group content', (category) => {
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
        if (category === 'world-quests') {
            entry.worldQuests = entry.patchOverview;
            delete entry.patchOverview;
        }
        if (category === 'side-stories') {
            entry.sideStories = entry.patchOverview;
            delete entry.patchOverview;
        }
        const data = entry.sideStories ?? entry.worldQuests ?? entry.mainStory ?? entry.patchOverview!;
        fixture.componentRef.setInput('entry', entry);
        fixture.componentRef.setInput('editing', true);
        fixture.detectChanges();
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
        const up = groups[1].querySelectorAll('.patch-row-actions button')[3] as HTMLButtonElement;
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
