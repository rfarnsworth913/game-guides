import { BehaviorSubject } from 'rxjs';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { GameImagePicker } from './game-image-picker';
import { Story } from './story';
import { Entry, WorkspaceStore } from './workspace.store';
import { emptyPatchOverview } from '../../../../common/story-template';

describe('Story incomplete filter', () => {
    it('edits a navigation icon with the compact picker and renders uploaded icons after saving', async () => {
        const section: Entry = { id: 'section', game: 'genshin', kind: 'story-category', name: 'Mondstadt', icon: '*',
            notes: '', quantity: 0, target: 0, rarity: 1, category: '', members: [], requirements: [], completed: false, order: 0, day: '' };
        const entries = signal([section]);
        const save = vi.fn(async (entry: Entry) => { entries.set([entry]); return true; });
        TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: WorkspaceStore, useValue: {
            entries, initialized: signal(true), loading: signal(false), saving: signal(false), error: signal(''), save,
        } }] });
        vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
        const fixture = TestBed.createComponent(Story);
        fixture.componentRef.setInput('game', 'genshin');
        fixture.detectChanges();
        const component = fixture.componentInstance;
        component.editMode.set(true);
        component.open('story-category', section);
        fixture.changeDetectorRef.markForCheck();
        fixture.detectChanges();
        await fixture.whenStable();
        const root = fixture.nativeElement as HTMLElement;
        expect(root.querySelector('.navigation-category-icon > span')?.textContent).toBe('Icon or Icon URL');
        expect(root.querySelector('.navigation-category-icon .compact-icon-button')).not.toBeNull();
        const picker = fixture.debugElement.query(By.css('.navigation-category-icon gg-game-image-picker')).componentInstance as GameImagePicker;
        expect(picker.compact()).toBe(true);
        expect(picker.value()).toBe('*');
        picker.pending.set({ name: 'mondstadt.webp', url: '/api/games/genshin/images/mondstadt.webp' });
        picker.useSelected();
        fixture.detectChanges();
        expect(component.editor?.icon).toBe('/api/games/genshin/images/mondstadt.webp');
        expect(section.icon).toBe('*');
        expect(save).not.toHaveBeenCalled();
        await component.save();
        fixture.detectChanges();
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ icon: '/api/games/genshin/images/mondstadt.webp' }));
        expect(root.querySelector('#story-tab-section img')?.getAttribute('src')).toBe('/api/games/genshin/images/mondstadt.webp');
        expect(component.iconUrl('https://example.com/icon.png')).toBe('https://example.com/icon.png');
        expect(component.iconUrl('*')).toBeNull();
        expect(component.iconUrl('javascript:alert(1)')).toBeNull();
        expect(component.iconUrl('/api/games/genshin/images/../secret.png')).toBeNull();
    });
    it('nests related templates beneath the preceding patch or main story in the outline', () => {
        const section: Entry = { id: 'section', game: 'genshin', kind: 'story-category', name: 'Mondstadt',
            notes: '', quantity: 0, target: 0, rarity: 0, category: '', members: [], requirements: [],
            completed: false, order: 0, day: '' };
        const entry = (id: string, category: string, order: number): Entry => ({
            ...section, id, name: id, kind: 'story', storySection: section.id, category, order,
        });
        const entries = signal([section, entry('patch', 'patch-overview', 0),
            entry('event', 'events', 1), entry('main', 'main-story', 2),
            entry('world', 'world-quests', 3), entry('character', 'character-information', 4),
            entry('later-event', 'events', 5), entry('later-world', 'world-quests', 6)]);
        TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: WorkspaceStore, useValue: {
            entries, initialized: signal(true), loading: signal(false), saving: signal(false), error: signal(''),
        } }] });
        const fixture = TestBed.createComponent(Story);
        fixture.componentRef.setInput('game', 'genshin');
        fixture.detectChanges();
        const component = fixture.componentInstance;
        expect(component.outlineChapters().map(chapter => [chapter.id, chapter.children.map(child => child.id)]))
            .toEqual([['patch', ['event']], ['main', ['world', 'character', 'later-event', 'later-world']]]);
        const root = fixture.nativeElement as HTMLElement;
        expect(root.querySelectorAll('.outline-chapter').length).toBe(2);
        expect(root.querySelector('.outline-group')).toBeNull();
        expect(root.querySelector('.story-outline h3')?.textContent).toBe('Story Navigation');
        expect(root.querySelector('.outline-number')).toBeNull();
        expect(root.querySelector('.outline-chapter-heading small')).toBeNull();
        expect(root.querySelector('.outline-toggle svg')).not.toBeNull();
        expect(root.querySelector('.outline-book')).not.toBeNull();
        const navigate = vi.spyOn(component, 'jumpTo').mockImplementation(() => {});
        root.querySelector<HTMLAnchorElement>('.outline-chapter-heading a')!.click();
        fixture.detectChanges();
        expect(navigate).toHaveBeenCalledWith(expect.any(Event), 'story-content-patch');
        expect(component.outlineCollapsed('patch')).toBe(false);
        navigate.mockRestore();
        component.expandOutline();
        fixture.detectChanges();
        expect(root.querySelector('.outline-group a[href="#story-content-world"]')).not.toBeNull();
        expect(root.querySelector('#story-content-world')).not.toBeNull();
        const operator = root.querySelector('.outline-group[data-story-topic="character-information"] .outline-secondary');
        expect(operator?.textContent).toContain('character');
        expect(operator?.querySelector('.story-category-icon')).not.toBeNull();
        expect(root.querySelector('.outline-group[data-story-topic="character-information"] button')).toBeNull();
        expect(root.querySelector('.outline-group button')).toBeNull();
        expect(root.querySelectorAll('.outline-secondary').length).toBe(5);
        const contentOrder = [...root.querySelectorAll('.story-subsections [id^="story-content-"]')].map(element => '#' + element.id);
        const navigationOrder = [...root.querySelectorAll('.story-outline a')].map(element => element.getAttribute('href'));
        expect(navigationOrder).toEqual(contentOrder);
        expect([...root.querySelectorAll('.outline-secondary')].every(link => link.querySelector('.story-category-icon'))).toBe(true);
        root.querySelector<HTMLButtonElement>('.outline-toggle')!.click();
        fixture.detectChanges();
        expect(root.querySelector('.outline-chapter')?.querySelector('.outline-group')).toBeNull();
        entries.set([section, entry('world-only', 'world-quests', 0)]);
        fixture.detectChanges();
        component.expandOutline();
        fixture.detectChanges();
        expect(component.outlineChapters()[0].entry).toBeNull();
        expect(root.querySelector('.outline-group a')?.textContent).toContain('world-only');
        entries.set([section, entry('main-only', 'main-story', 0)]);
        fixture.detectChanges();
        expect(root.querySelector('.outline-toggle')).toBeNull();
    });
    it('tracks content at the visible viewport center, separating attached content from its parent', () => {
        const viewportHeight = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
        const section: Entry = { id: 'section', game: 'genshin', kind: 'story-category', name: 'Mondstadt',
            notes: '', quantity: 0, target: 0, rarity: 0, category: '', members: [], requirements: [],
            completed: false, order: 0, day: '' };
        const first: Entry = { ...section, id: 'first', kind: 'story', storySection: section.id, category: 'main-story' };
        const second: Entry = { ...first, id: 'second', category: 'world-quests', order: 1 };
        TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: WorkspaceStore, useValue: {
            entries: signal([section, first, second]), initialized: signal(true), loading: signal(false),
            saving: signal(false), error: signal(''),
        } }] });
        const fixture = TestBed.createComponent(Story);
        fixture.componentRef.setInput('game', 'genshin');
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        const rect = (top: number, bottom: number) => ({ top, bottom } as DOMRect);
        vi.spyOn(root.querySelector<HTMLElement>('.story-sticky-header')!, 'getBoundingClientRect').mockReturnValue(rect(0, 100));
        const parent = root.querySelector<HTMLElement>('#story-content-first')!;
        const child = root.querySelector<HTMLElement>('#story-content-second')!;
        for (const target of [parent, child]) vi.spyOn(target, 'getClientRects').mockReturnValue([rect(0, 500)] as unknown as DOMRectList);
        const center = 100 + (window.innerHeight - 100) / 2;
        vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue(rect(-300, center + 300));
        const childBounds = vi.spyOn(child, 'getBoundingClientRect').mockReturnValue(rect(center + 50, center + 300));
        fixture.componentInstance.updateOutlineFromScroll();
        expect(fixture.componentInstance.activeOutline()).toBe(parent.id);
        childBounds.mockReturnValue(rect(center - 10, center + 300));
        fixture.componentInstance.updateOutlineFromScroll();
        expect(fixture.componentInstance.activeOutline()).toBe(child.id);
        fixture.detectChanges();
        expect(root.querySelector('.outline-chapter-heading a.active')).not.toBeNull();
        fixture.componentInstance.expandOutline();
        fixture.detectChanges();
        expect(root.querySelector('.outline-group a.active')?.getAttribute('href')).toBe('#story-content-second');
        fixture.componentInstance.collapseOutline();
        expect(fixture.componentInstance.expandedOutline()).toEqual([]);
        viewportHeight.mockRestore();
    });
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
        expect(fixture.nativeElement.querySelectorAll('gg-story-content-list').length).toBe(1);
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
        const fragment = new BehaviorSubject<string | null>(null);
        const entries = signal(initial);
        TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: WorkspaceStore, useValue: {
            entries, initialized: signal(true), loading: signal(false), saving: signal(false), error: signal(''),
        } }] });
        TestBed.overrideProvider(ActivatedRoute, { useValue: {
            paramMap: params, snapshot: { paramMap: params.value, queryParamMap: convertToParamMap({}) },
            queryParamMap: new BehaviorSubject(convertToParamMap({})),
            fragment,
        } });
        vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
        const fixture = TestBed.createComponent(Story);
        fixture.componentRef.setInput('game', 'zzz');
        fixture.detectChanges();
        return { fixture, entries, params, fragment };
    }
    const section = (id: string, game = 'zzz', order = 0): Entry => ({
        id, game, order, kind: 'story-category', name: id, notes: '', category: '',
        quantity: 0, target: 0, rarity: 0, members: [], requirements: [], completed: false, day: '',
    });

    it('opens and remembers the row targeted by a dashboard resume link', async () => {
        const chapter: Entry = { ...section('chapter'), kind: 'story', category: 'main-story', storySection: 'region',
            mainStory: { ...emptyPatchOverview(), rows: [{ id: 'quest', content: 'Next quest', contentType: '', patch: '1.0', notes: '' }] } };
        const { fixture, fragment } = setup([section('region'), chapter]);
        const target = fixture.nativeElement.querySelector('#story-row-chapter-quest') as HTMLElement;
        target.scrollIntoView = vi.fn();
        fragment.next('story-row-chapter-quest');
        fixture.detectChanges();
        await fixture.whenStable();
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
        expect(fixture.componentInstance.positions.positions()['zzz']).toMatchObject({ entryId: 'chapter', rowId: 'quest' });
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
