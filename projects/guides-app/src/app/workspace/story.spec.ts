import { BehaviorSubject } from 'rxjs';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Story } from './story';
import { Entry, WorkspaceStore } from './workspace.store';
import { emptyPatchOverview } from '../../../../common/story-template';

describe('Story incomplete filter', () => {
    it('shows a compact creation form and requires valid fields before creation', async () => {
        const section: Entry = { id: 'section', game: 'genshin', kind: 'story-category', name: 'Mondstadt',
            notes: '', quantity: 0, target: 0, rarity: 0, category: '', members: [], requirements: [],
            completed: false, order: 0, day: '' };
        const save = vi.fn().mockResolvedValue(true);
        TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: WorkspaceStore, useValue: {
            entries: signal([section]), initialized: signal(true), loading: signal(false),
            saving: signal(false), error: signal(''), save,
        } }] });
        const fixture = TestBed.createComponent(Story);
        fixture.componentRef.setInput('game', 'genshin');
        fixture.detectChanges();
        const component = fixture.componentInstance;
        component.editMode.set(true);
        component.open('story');
        fixture.changeDetectorRef.markForCheck();
        fixture.detectChanges();
        await fixture.whenStable();
        const modal = fixture.nativeElement.querySelector('.create-subsection-modal') as HTMLElement;
        expect(modal.querySelector('h2')?.textContent).toContain('Create Subsection');
        expect([...modal.querySelectorAll('form > label')].map((label) => label.firstChild?.textContent?.trim())).toEqual(['Content Template', 'Navigation Category', 'Section Title']);
        expect(modal.querySelector('gg-patch-overview')).toBeNull();
        expect((modal.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
        component.editor!.name = '   ';
        await component.save();
        expect(save).not.toHaveBeenCalled();
        component.editor!.name = 'The Outlander Who Caught the Wind';
        expect(component.validNewSubsection()).toBe(true);
        component.editor!.storySection = 'missing';
        expect(component.validNewSubsection()).toBe(false);
        component.editor!.storySection = section.id;
        component.editor!.category = 'invalid';
        expect(component.validNewSubsection()).toBe(false);
    });
    it('collapses content during reordering and saves only the current section order', async () => {
        const section: Entry = { id: 'section', game: 'endfield', kind: 'story-category', name: 'Region',
            notes: '', quantity: 0, target: 0, rarity: 0, category: '', members: [], requirements: [],
            completed: false, order: 0, day: '' };
        const first: Entry = { ...section, id: 'first', kind: 'story', storySection: section.id, name: 'First', category: 'lore', notes: 'First content', order: 10 };
        const second: Entry = { ...first, id: 'second', name: 'Second', notes: 'Second content', order: 20 };
        const other: Entry = { ...first, id: 'other', game: 'genshin', order: 99 };
        const entries = signal([section, first, second, other]);
        const replace = vi.fn(async (next: Entry[]) => { entries.set(next); return true; });
        TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: WorkspaceStore, useValue: {
            entries, initialized: signal(true), loading: signal(false), saving: signal(false), error: signal(''), replace,
        } }] });
        const fixture = TestBed.createComponent(Story);
        fixture.componentRef.setInput('game', 'endfield');
        fixture.detectChanges();
        fixture.componentInstance.editMode.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelectorAll('.story-drag-handle').length).toBe(2);
        fixture.componentInstance.startReorder({ button: 0, pointerId: 1, preventDefault() {},
            currentTarget: { setPointerCapture() {}, hasPointerCapture: () => false } } as unknown as PointerEvent, first);
        fixture.detectChanges();
        expect([...fixture.nativeElement.querySelectorAll('.story-entry-body')].every((body: any) => body.hidden)).toBe(true);
        fixture.componentInstance.cancelReorder();
        fixture.detectChanges();
        expect(replace).not.toHaveBeenCalled();
        expect(fixture.nativeElement.querySelector('.story-entry-body').hidden).toBe(false);
        await fixture.componentInstance.reorderEntry(first.id, second.id, true);
        expect(entries().find((entry) => entry.id === first.id)?.order).toBe(1);
        expect(entries().find((entry) => entry.id === second.id)?.order).toBe(0);
        expect(entries().find((entry) => entry.id === other.id)).toEqual(other);
        fixture.componentInstance.editMode.set(false);
        await fixture.componentInstance.reorderEntry(second.id, first.id, true);
        expect(replace).toHaveBeenCalledTimes(1);
    });
    it('requires confirmation before deleting a navigation section and lets the user cancel', async () => {
        const section: Entry = { id: 'section', game: 'endfield', kind: 'story-category', name: 'Valley IV',
            notes: '', quantity: 0, target: 0, rarity: 0, category: '', members: [], requirements: [],
            completed: false, order: 0, day: '' };
        const remove = vi.fn().mockResolvedValue(true);
        TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: WorkspaceStore, useValue: {
            entries: signal([section]), initialized: signal(true), loading: signal(false),
            saving: signal(false), error: signal(''), remove,
        } }] });
        const fixture = TestBed.createComponent(Story);
        fixture.componentRef.setInput('game', 'endfield');
        fixture.detectChanges();
        fixture.componentInstance.editMode.set(true);
        fixture.detectChanges();
        const deleteButton = () => [...fixture.nativeElement.querySelectorAll('.story-actions button')]
            .find((button: any) => button.textContent.trim() === 'Delete section') as HTMLButtonElement;
        deleteButton().click();
        fixture.detectChanges();
        expect(remove).not.toHaveBeenCalled();
        const dialog = fixture.nativeElement.querySelector('[role="alertdialog"]') as HTMLElement;
        expect(dialog.textContent).toContain('Delete Valley IV?');
        expect(dialog.textContent).toContain('every subsection');
        (dialog.querySelector('button') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).toBeNull();
        expect(remove).not.toHaveBeenCalled();
        deleteButton().click();
        fixture.detectChanges();
        (fixture.nativeElement.querySelector('[role="alertdialog"] button.danger') as HTMLButtonElement).click();
        await fixture.whenStable();
        expect(remove).toHaveBeenCalledExactlyOnceWith(section.id);
    });
    it('hides a completed parent banner while showing incomplete attached character information', () => {
        const base: Entry = { id: 'section', game: 'endfield', kind: 'story-category', name: 'Region',
            notes: '', quantity: 0, target: 0, rarity: 0, category: '', members: [], requirements: [],
            completed: false, order: 0, day: '' };
        const row = { id: 'row', contentType: '', content: 'Operator Profile', patch: '1.0', notes: '' };
        const parent: Entry = { ...base, id: 'parent', kind: 'story', storySection: base.id,
            name: 'Completed Side Story', category: 'side-stories', completed: true,
            sideStories: { ...emptyPatchOverview(), rows: [row] }, storyRowCompletion: { row: true } };
        const child: Entry = { ...base, id: 'child', kind: 'story', storySection: base.id, order: 1,
            name: 'Operator Info', category: 'character-information',
            characterInformation: { ...emptyPatchOverview(), characterName: 'Laevatain', rows: [row] } };
        TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: WorkspaceStore, useValue: {
            entries: signal([base, parent, child]), initialized: signal(true), loading: signal(false),
            saving: signal(false), error: signal(''),
        } }] });
        const fixture = TestBed.createComponent(Story);
        fixture.componentRef.setInput('game', 'endfield');
        fixture.detectChanges();
        fixture.componentInstance.incompleteOnly.set(true);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('.patch-hero')).toBeNull();
        expect(fixture.nativeElement.textContent).toContain('Laevatain');
        expect(fixture.nativeElement.textContent).toContain('Operator Profile');
        expect(fixture.nativeElement.querySelectorAll('.patch-groups').length).toBe(1);
        fixture.componentInstance.incompleteOnly.set(false);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('.patch-hero')).not.toBeNull();
    });
});


describe('Story tab persistence', () => {
    beforeEach(() => {
        const values = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key: string) => values.get(key) ?? null),
            setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
        });
    });
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

    function setup(initial: Entry[] = []) {
        const params = new BehaviorSubject(convertToParamMap({}));
        const entries = signal(initial);
        TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: WorkspaceStore, useValue: {
            entries, initialized: signal(true), loading: signal(false), saving: signal(false), error: signal(''),
        } }] });
        TestBed.overrideProvider(ActivatedRoute, { useValue: {
            paramMap: params, snapshot: { paramMap: params.value, queryParamMap: convertToParamMap({}) },
            queryParamMap: new BehaviorSubject(convertToParamMap({})),
        } });
        vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
        const fixture = TestBed.createComponent(Story);
        fixture.componentRef.setInput('game', 'zzz');
        fixture.detectChanges();
        return { fixture, entries, params };
    }
    const section = (id: string, game = 'zzz', order = 0): Entry => ({
        id, game, order, kind: 'story-category', name: id, notes: '', category: '',
        quantity: 0, target: 0, rarity: 0, members: [], requirements: [], completed: false, day: '',
    });

    it('remembers clicked tabs after recreation and keeps each game independent', () => {
        const data = [section('first'), section('second', 'zzz', 1), section('other', 'genshin')];
        const { fixture } = setup(data);
        (fixture.nativeElement.querySelector('#story-tab-second') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(localStorage.getItem('gg-story-tab-v1:zzz')).toBe('second');
        fixture.componentRef.setInput('game', 'genshin');
        fixture.detectChanges();
        expect(fixture.componentInstance.active()?.id).toBe('other');
        fixture.componentInstance.selectSection('other');
        fixture.componentRef.setInput('game', 'zzz');
        fixture.detectChanges();
        expect(fixture.componentInstance.active()?.id).toBe('second');
        fixture.destroy();
        const restored = TestBed.createComponent(Story);
        restored.componentRef.setInput('game', 'zzz');
        restored.detectChanges();
        expect(restored.componentInstance.active()?.id).toBe('second');
        expect(localStorage.getItem('gg-story-tab-v1:genshin')).toBe('other');
    });

    it('waits for loaded sections and falls back when the remembered tab is removed', () => {
        localStorage.setItem('gg-story-tab-v1:zzz', 'second');
        const { fixture, entries } = setup();
        expect(fixture.componentInstance.active()).toBeUndefined();
        entries.set([section('first'), section('second', 'zzz', 1)]);
        fixture.detectChanges();
        expect(fixture.componentInstance.active()?.id).toBe('second');
        entries.set([section('first')]);
        fixture.detectChanges();
        expect(fixture.componentInstance.active()?.id).toBe('first');
    });

    it('opens readable URL tabs before saved preferences and follows path changes', () => {
        localStorage.setItem('gg-story-tab-v1:zzz', 'first');
        const { fixture, entries, params } = setup();
        params.next(convertToParamMap({ section: 'inazuma' }));
        entries.set([section('first'), { ...section('second', 'zzz', 1), name: 'Inazuma' }]);
        fixture.detectChanges();
        expect(fixture.componentInstance.active()?.id).toBe('second');
        fixture.componentInstance.selectSection('second');
        expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/', 'zzz', 'story', 'inazuma'], {
            queryParams: { section: null }, queryParamsHandling: 'merge', preserveFragment: true,
        });
        params.next(convertToParamMap({ section: 'first' }));
        fixture.detectChanges();
        expect(fixture.componentInstance.active()?.id).toBe('first');
        params.next(convertToParamMap({ section: 'deleted' }));
        fixture.detectChanges();
        expect(fixture.componentInstance.active()?.id).toBe('first');
    });

    it('normalizes section titles and distinguishes duplicate names', () => {
        const { fixture } = setup([{ ...section('a'), name: 'Chapter 1: New Eridu!' },
            { ...section('b'), name: 'Chapter 1: New Eridu!' }, { ...section('c'), name: 'Inazuma' }]);
        const component = fixture.componentInstance;
        expect(component.sections().map((item) => component.sectionSlug(item))).toEqual([
            'chapter-1-new-eridu-a', 'chapter-1-new-eridu-b', 'inazuma',
        ]);
    });

    it('allows navigation when browser storage is blocked', () => {
        vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
        const { fixture } = setup([section('first'), section('second', 'zzz', 1)]);
        expect(fixture.componentInstance.active()?.id).toBe('first');
        fixture.componentInstance.selectSection('second');
        fixture.detectChanges();
        expect(fixture.componentInstance.active()?.id).toBe('second');
    });
});
