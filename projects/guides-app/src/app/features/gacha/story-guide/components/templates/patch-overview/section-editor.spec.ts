import { TestBed } from '@angular/core/testing';
import { PatchOverviewTemplate } from './patch-overview';
import { Entry, WorkspaceStore } from '../../../../../../core/state/workspace.store';
import { emptyPatchOverview, validPatchOverview } from '@common/quests/story-template';

describe('Content section editor workspace', () => {
    function setup() {
        const save = vi.fn();
        TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: { save, saving: () => false, loading: () => false } }] });
        const entry: Entry = { id: 'draft', game: 'genshin', kind: 'story', category: 'patch-overview', name: 'A patch', notes: '', rarity: 1, members: [], requirements: [], order: 0, day: '', completed: false, quantity: 0, target: 0,
            storyRowCompletion: { first: true }, patchOverview: { ...emptyPatchOverview(), groups: [{ id: 'a', title: 'Patch Notes' }, { id: 'b', title: 'Trailers' }, { id: 'c', title: 'Music' }], rows: [
                { id: 'first', groupId: 'a', content: 'Wiki', contentType: '', contentUrl: 'https://example.com', patch: '1.0', notes: 'Existing note' },
                { id: 'second', groupId: 'b', content: 'Trailer', contentType: '', patch: '1.0', notes: 'Draft note' },
            ] } };
        const fixture = TestBed.createComponent(PatchOverviewTemplate);
        fixture.componentRef.setInput('entry', entry); fixture.componentRef.setInput('editing', true); fixture.detectChanges();
        return { fixture, component: fixture.componentInstance, root: fixture.nativeElement as HTMLElement, data: entry.patchOverview!, entry, save };
    }
    it('shows Overview first, edits only the chosen panel and preserves row drafts when navigating', async () => {
        const { fixture, component, root, data, save } = setup();
        expect(component.editorSelection()).toBeNull();
        expect(root.querySelector('.editor-delete-group')).toBeNull();
        expect(root.querySelector<HTMLElement>('.section-editor-overview')?.hidden).toBe(false);
        expect([...root.querySelectorAll<HTMLElement>('.patch-edit-group')].every(group => group.hidden)).toBe(true);
        root.querySelector<HTMLButtonElement>('[data-editor-group="b"] .editor-group-link')!.click(); fixture.detectChanges();
        expect(component.editorSelection()).toBe('b');
        expect(root.querySelector('.editor-panel-heading > .editor-delete-group')?.textContent).toBe('Delete Content Group');
        expect(root.querySelector<HTMLElement>('.section-editor-overview')?.hidden).toBe(true);
        expect([...root.querySelectorAll<HTMLElement>('.patch-edit-group')].filter(group => !group.hidden).map(group => group.getAttribute('aria-label'))).toEqual(['Trailers']);
        component.expandedRow.set('second'); fixture.detectChanges(); await fixture.whenStable();
        const notes = root.querySelector<HTMLTextAreaElement>('[data-story-editor-row="second"] textarea[name="notes-second"]')!;
        notes.value = 'A long unsaved note'; notes.dispatchEvent(new Event('input')); fixture.detectChanges();
        component.selectEditorPanel(null); fixture.detectChanges(); component.selectEditorPanel('b'); fixture.detectChanges();
        expect(notes.value).toBe('A long unsaved note'); expect(data.rows[1].notes).toBe(notes.value);
        expect(save).not.toHaveBeenCalled();
    });
    it('separates Template Details from Overview and groups without resetting template drafts', async () => {
        const { fixture, component, root, data, save } = setup();
        const overview = root.querySelector<HTMLElement>('.section-editor-overview')!;
        const details = root.querySelector<HTMLElement>('.section-editor-template-details')!;
        expect(overview.hidden).toBe(false); expect(details.hidden).toBe(true);
        expect(overview.querySelector('fieldset')).toBeNull();
        expect(overview.querySelector('textarea')).not.toBeNull();
        expect(details.querySelector('.patch-image-editor')).not.toBeNull();
        root.querySelector<HTMLButtonElement>('.editor-template-details-link')!.click(); fixture.detectChanges(); await fixture.whenStable();
        expect(overview.hidden).toBe(true); expect(details.hidden).toBe(false);
        expect(root.querySelector('.editor-panel-heading h3')?.textContent).toBe('Template Details');
        expect(root.querySelector('.editor-template-details-link')?.getAttribute('aria-current')).toBe('page');
        expect(root.querySelector('.editor-overview-link:not(.editor-template-details-link)')?.getAttribute('aria-current')).toBeNull();
        expect(details.querySelector('gg-story-context-editor')).toBeNull();
        expect(details.querySelector('input[name=releaseDate]')).not.toBeNull();
        const version = details.querySelector<HTMLInputElement>('input[name=patchVersion]')!;
        version.value = '2.5'; version.dispatchEvent(new Event('input')); fixture.detectChanges();
        component.selectEditorPanel('a'); fixture.detectChanges();
        expect(component.templateDetailsOpen()).toBe(false); expect(details.hidden).toBe(true);
        component.selectTemplateDetails(); fixture.detectChanges();
        expect(version.value).toBe('2.5'); expect(data.patchVersion).toBe('2.5');
        component.selectEditorPanel(null); fixture.detectChanges();
        expect(overview.hidden).toBe(false); expect(component.editorPanelTitle()).toBe('Overview');
        expect(data.groups!.map(group => group.id)).toEqual(['a', 'b', 'c']); expect(save).not.toHaveBeenCalled();
    });
    it('places Activity Sub-type above Notes and removes obsolete flags without losing existing notes', async () => {
        const { fixture, component, root, data } = setup();
        Object.assign(data.rows[0], { subQuest: true, notesRight: 'Original additional note' });
        component.selectEditorPanel('a'); component.expandedRow.set('first'); fixture.detectChanges(); await fixture.whenStable();
        const card = root.querySelector<HTMLElement>('[data-story-editor-row="first"]')!;
        const subtype = card.querySelector('gg-story-subtype-editor')!;
        const notes = card.querySelector<HTMLTextAreaElement>('textarea[name="notes-first"]')!;
        const fieldOrder = [...card.querySelectorAll('gg-story-subtype-editor, textarea[name="notes-first"]')];
        expect(fieldOrder).toEqual([subtype, notes]);
        expect(card.querySelectorAll('gg-story-subtype-editor')).toHaveLength(1);
        expect(card.querySelector('.row-flags')).toBeNull();
        expect(card.textContent).not.toContain('Split Notes'); expect(card.textContent).not.toContain('Sub-quest');
        expect(card.querySelector<HTMLTextAreaElement>('textarea[name="notesRight-first"]')?.value).toBe('Original additional note');
        expect(data.rows[0].notes).toBe('Existing note'); expect(data.rows[0].subQuest).toBe(true);
    });
    it('keeps row details and drafts while collapsing panels and provides working summary actions', async () => {
        const { fixture, component, root, data, save } = setup();
        component.selectEditorPanel('a'); fixture.detectChanges();
        const card = root.querySelector<HTMLElement>('[data-story-editor-row="first"]')!;
        card.querySelector<HTMLButtonElement>('[aria-label="Edit Wiki"]')!.click(); fixture.detectChanges(); await fixture.whenStable();
        expect(component.expandedRow()).toBe('first');
        const toggles = card.querySelectorAll<HTMLButtonElement>('.context-panel-toggle');
        expect(toggles).toHaveLength(2);
        expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
        const body = card.querySelector<HTMLElement>('.context-panel-body')!;
        expect(body.hasAttribute('inert')).toBe(true);
        toggles[0].click(); fixture.detectChanges();
        expect(body.hasAttribute('inert')).toBe(false);
        const add = [...body.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('Add requirement'))!;
        add.click(); fixture.detectChanges(); await fixture.whenStable();
        const description = body.querySelector<HTMLTextAreaElement>('textarea')!;
        description.value = 'Complete the introduction'; description.dispatchEvent(new Event('input')); fixture.detectChanges();
        toggles[0].click(); fixture.detectChanges(); toggles[0].click(); fixture.detectChanges();
        expect(description.value).toBe('Complete the introduction');
        expect(toggles[0].querySelector('.context-panel-count')?.textContent).toBe('1');
        expect(data.rows[0].context?.requirements?.[0].text).toBe('Complete the introduction');
        card.querySelector<HTMLButtonElement>('[aria-label="Delete Wiki"]')!.click(); fixture.detectChanges();
        expect(data.rows.map(row => row.id)).toEqual(['second']);
        expect(save).not.toHaveBeenCalled();
    });
    it('reorders groups by drag position without changing row IDs, ownership, links or completion', async () => {
        const { fixture, component, data, root, entry, save } = setup();
        const rows = structuredClone(data.rows); const progress = structuredClone(entry.storyRowCompletion);
        const source = data.groups![0], target = data.groups![2];
        const button = root.querySelector<HTMLButtonElement>('[data-editor-group="a"] .editor-group-link')!;
        const focus = vi.spyOn(button, 'focus');
        component.startGroupDrag({ dataTransfer: { setData: vi.fn() } } as unknown as DragEvent, source);
        component.groupDropAfter.set(true);
        component.dropGroup({ preventDefault: vi.fn() } as unknown as DragEvent, target);
        fixture.detectChanges(); await fixture.whenStable();
        expect(data.groups!.map(group => group.id)).toEqual(['b', 'c', 'a']);
        expect(component.editorSelection()).toBe('a'); expect(component.draggingGroup()).toBe('');
        expect(focus).toHaveBeenCalledWith({ preventScroll: true });
        expect(data.rows).toEqual(rows); expect(entry.storyRowCompletion).toEqual(progress);
        expect(validPatchOverview(data)).toBe(true); expect(save).not.toHaveBeenCalled();
        component.startGroupDrag({ dataTransfer: { setData: vi.fn() } } as unknown as DragEvent, source); component.endGroupDrag();
        expect(data.groups!.map(group => group.id)).toEqual(['b', 'c', 'a']);
    });
    it('supports keyboard ordering, opens new groups, and keeps removed group content accessible', async () => {
        const { fixture, component, root, data, save } = setup();
        root.querySelector<HTMLButtonElement>('[data-editor-group="b"] .editor-group-link')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true }));
        fixture.detectChanges(); await fixture.whenStable();
        expect(data.groups!.map(group => group.id)).toEqual(['b', 'a', 'c']); expect(component.editorSelection()).toBe('b');
        root.querySelector<HTMLButtonElement>('.editor-panel-heading .editor-delete-group')!.click(); fixture.detectChanges();
        expect(component.editorSelection()).toBe(''); expect(data.rows.find(row => row.id === 'second')?.groupId).toBeUndefined();
        expect(root.querySelector('.editor-ungrouped-link')).not.toBeNull();
        root.querySelector<HTMLButtonElement>('.editor-add-group')!.click(); fixture.detectChanges();
        expect(component.editorSelection()).toBe(data.groups!.at(-1)!.id);
        expect(root.querySelector('.editor-panel-heading h3')?.textContent).toBe('New group');
        expect(data.rows.map(row => row.id)).toEqual(['first', 'second']); expect(save).not.toHaveBeenCalled();
    });
    it('handles removing an empty group and category changes without stranding the active panel or losing template data', () => {
        const { fixture, component, root, data, entry } = setup();
        component.selectEditorPanel('c'); fixture.detectChanges();
        root.querySelector<HTMLButtonElement>('.editor-panel-heading .editor-delete-group')!.click(); fixture.detectChanges();
        expect(component.editorSelection()).toBe('a');
        component.selectEditorPanel(null);
        const next = { ...entry, category: 'events', eventStory: { ...emptyPatchOverview(), groups: [{ id: 'event', title: 'Challenges' }] } };
        fixture.componentRef.setInput('entry', next); fixture.detectChanges();
        expect(component.data()).toBe(next.eventStory); expect(component.data().groups?.[0].id).toBe('event');
        expect((fixture.nativeElement as HTMLElement).querySelector('.section-editor-template-details gg-story-context-editor input[type=date]')).not.toBeNull();
        expect(next.patchOverview).toBe(data); expect(data.rows).toHaveLength(2);
    });
});
