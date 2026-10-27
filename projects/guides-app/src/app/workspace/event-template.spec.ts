import { TestBed } from '@angular/core/testing';
import { PatchOverviewTemplate } from './patch-overview';
import { Entry, WorkspaceStore } from './workspace.store';
import { emptyPatchOverview, trimPatchOverviewText, validPatchOverview, type PatchOverview } from '../../../../common/story-template';
import { StoryAvailability, StoryRequirementType } from '../../../../common/enums/story-tracking.enum';

describe('Event banner, metadata bar and content groups', () => {
    function setup() {
        const data: PatchOverview = { ...emptyPatchOverview(), patchVersion: '1.0', summary: 'Event **guidance**',
            context: { availability: StoryAvailability.Limited, prerequisites: [{ type: StoryRequirementType.Prerequisite, text: 'Complete the prologue' }] },
            groups: [{ id: 'event', title: 'Searing Scars', contentUrl: 'https://example.com/event' }], rows: [
                { id: 'stages', groupId: 'event', rowType: 'heading', content: 'Challenge Stages', contentType: '', patch: '', notes: '' },
                ...['Sea of Loathing', 'Melting Point of Flesh', 'Howling Flame'].map((content, index) => ({ id: `stage-${index}`, groupId: 'event', content, contentUrl: `https://example.com/stage-${index}`, contentType: '', patch: '1.0', notes: `Challenge stage ${index + 1}` })),
            ] };
        const entry: Entry = { id: 'event-guide', game: 'endfield', kind: 'story', category: 'events', name: 'Umbral Monument: Searing Scars', notes: '', order: 0, day: '', rarity: 1, members: [], requirements: [], completed: false, quantity: 0, target: 0, eventStory: data, storyRowCompletion: { 'stage-0': true } };
        const save = vi.fn();
        TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: { save, saving: () => false, loading: () => false } }] });
        const fixture = TestBed.createComponent(PatchOverviewTemplate);
        fixture.componentRef.setInput('entry', entry);
        fixture.detectChanges();
        return { fixture, entry, data, save, root: fixture.nativeElement as HTMLElement };
    }
    it('restores the banner and regular groups with a metadata bar immediately above the groups', () => {
        const { root } = setup();
        expect(root.querySelector('.patch-hero h3')?.textContent).toBe('Umbral Monument: Searing Scars');
        expect([...root.querySelectorAll('.guide-event-facts dd')].map(element => element.textContent)).toEqual(['Patch 1.0', 'Limited-time', '1 / 3']);
        const bar = root.querySelector('.guide-event-info')!;
        expect(bar.nextElementSibling?.tagName).toBe('GG-STORY-CONTENT-LIST');
        expect(root.querySelector('.guide-event-overview')).toBeNull();
        expect(root.querySelector('.guide-row-heading h5')?.textContent?.trim()).toBe('Challenge Stages');
        expect(root.querySelector('.guide-linked-heading > span')?.textContent).toBe('1 / 3');
        expect(root.querySelectorAll('gg-story-content-list .guide-patch-badge')).toHaveLength(3);
        expect(root.querySelector('.guide-event-info .guide-patch-badge')?.textContent).toBe('Patch 1.0');
        expect(root.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
        expect(root.querySelector('#story-row-event-guide-stages input')).toBeNull();
        expect(root.querySelector('#story-row-event-guide-stage-1 .guide-row-details .notes-markdown')?.textContent).toContain('Challenge stage 2');
        expect(root.querySelector('.guide-event-stage-heading')).toBeNull();
    });
    it('separates group links, collapse controls and ID-based completion', () => {
        const { fixture, root, save, entry } = setup();
        const link = root.querySelector<HTMLAnchorElement>('.guide-linked-heading h4 a')!;
        const button = root.querySelector<HTMLButtonElement>('.guide-linked-heading button')!;
        expect(link.href).toBe('https://example.com/event');
        expect(link.target).toBe('_blank');
        expect(link.rel).toBe('noopener noreferrer');
        expect(link.textContent).toBe('Searing Scars');
        expect(link.querySelector('[aria-hidden]')).toBeNull();
        expect(link.closest('button')).toBeNull();
        link.addEventListener('click', event => event.preventDefault());
        link.click();
        expect(button.getAttribute('aria-expanded')).toBe('true');
        root.querySelector<HTMLInputElement>('#story-row-event-guide-stage-1 input')!.click();
        expect(save).toHaveBeenCalledWith({ ...entry, storyRowCompletion: { 'stage-0': true, 'stage-1': true } });
        button.click();
        fixture.detectChanges();
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(root.querySelector('.guide-reading-view > section > .guide-section-content')?.hasAttribute('inert')).toBe(true);
        document.dispatchEvent(new CustomEvent('story-guide-reveal', { detail: 'story-row-event-guide-stage-1' }));
        fixture.detectChanges();
        expect(button.getAttribute('aria-expanded')).toBe('true');
    });
    it('keeps participation information collapsible and derives counts from all stages when filtering', () => {
        const { fixture, root, data } = setup();
        const footer = root.querySelector<HTMLDetailsElement>('.guide-event-participation')!;
        expect(footer.open).toBe(false);
        expect(footer.closest('.guide-event-info')).not.toBeNull();
        expect(footer.textContent).toContain('Complete the prologue');
        expect(footer.querySelector('.notes-markdown strong')?.textContent).toBe('guidance');
        fixture.componentRef.setInput('incompleteOnly', true);
        fixture.detectChanges();
        expect(root.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
        expect(root.querySelector('.guide-linked-heading > span')?.textContent).toBe('1 / 3');
        expect([...root.querySelectorAll('.guide-event-facts dd')].at(-1)?.textContent).toBe('1 / 3');
        expect(data.rows.map(row => row.id)).toEqual(['stages', 'stage-0', 'stage-1', 'stage-2']);
    });
    it('exposes group link and event metadata fields in the editor without saving the draft', () => {
        const { fixture, root, save, data } = setup();
        fixture.componentRef.setInput('editing', true);
        fixture.detectChanges();
        expect(root.textContent).toContain('Group Title Link');
        expect(root.textContent).toContain('Introduced Patch');
        expect(root.textContent).toContain('Secondary Heading Link');
        expect(save).not.toHaveBeenCalled();
        data.groups![0].contentUrl = ' https://example.com/event ';
        trimPatchOverviewText(data);
        expect(data.groups![0].contentUrl).toBe('https://example.com/event');
        expect(validPatchOverview(data)).toBe(true);
        expect(validPatchOverview({ ...data, groups: [{ ...data.groups![0], contentUrl: 'javascript:alert(1)' }] })).toBe(false);
    });
    it('does not guess missing availability or the introduced patch in a multi-patch event', () => {
        const { fixture, root, data, entry } = setup();
        const changed = structuredClone(data);
        changed.patchVersion = '';
        changed.context = {};
        changed.rows[2].patch = '1.1';
        fixture.componentRef.setInput('entry', { ...entry, eventStory: changed });
        fixture.detectChanges();
        expect([...root.querySelectorAll('.guide-event-facts dd')].slice(0, 2).map(element => element.textContent)).toEqual(['Not specified', 'Not specified']);
        expect(root.querySelectorAll('.guide-patch-badge')).toHaveLength(3);
    });
});
