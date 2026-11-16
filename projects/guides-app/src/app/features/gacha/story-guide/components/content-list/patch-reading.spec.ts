import { TestBed } from '@angular/core/testing';
import { StoryContentList } from './story-content-list';
import { emptyPatchOverview } from '../../../../../../../../common/quests/story-template';
import type { Entry } from '../../../../../core/state/workspace.store';
import type { StoryTableRow } from '../../../../../../../../lib/types/story-template.type';

describe('Patch overview reading layout', () => {
    const row = (id: string, groupId: string, contentUrl = ''): StoryTableRow => ({ id, groupId, content: id, contentUrl, contentType: '', patch: '1.0', notes: '' });
    function setup() {
        const data = { ...emptyPatchOverview(), groups: [
            { id: 'notes', title: 'Patch Notes', contentUrl: 'https://example.com/notes' },
            { id: 'trailers', title: 'Trailers & Teasers' },
            { id: 'music', title: 'Music & EPs' },
            { id: 'other', title: 'Developer notes' },
            { id: 'clips', title: 'Cutscenes' },
        ], rows: [
            { ...row('notes-row', 'notes'), notes: 'Official **update** information.' },
            { ...row('trailer', 'trailers', 'https://youtu.be/abc'), thumbnailUrl: 'https://example.com/thumb.webp', duration: '02:36' },
            row('song', 'music', 'https://www.bilibili.com/video/abc'), row('other-row', 'other'), row('clip', 'clips'),
        ] };
        const entry: Entry = { id: 'patch', game: 'genshin', kind: 'story', category: 'patch-overview', name: 'Patch', notes: '', order: 0, day: '', rarity: 1, members: [], requirements: [], completed: false, quantity: 0, target: 0, patchOverview: data, storyRowCompletion: { trailer: true } };
        const fixture = TestBed.createComponent(StoryContentList);
        fixture.componentRef.setInput('data', data);
        fixture.componentRef.setInput('entry', entry);
        fixture.detectChanges();
        return { fixture, component: fixture.componentInstance, root: fixture.nativeElement as HTMLElement, data, entry };
    }
    it('renders individual cards without an outer media wrapper or changes to stored ordering and anchors', () => {
        const { component, root, data } = setup();
        const before = structuredClone(data);
        expect(component.groups().map(group => group.id)).toEqual(['notes', 'trailers', 'music', 'other', 'clips']);
        expect(root.querySelector('.patch-media-panel')).toBeNull();
        expect(root.querySelectorAll('.patch-reading-view > .guide-content-section')).toHaveLength(5);
        expect(root.querySelectorAll('.patch-reading-view > .patch-media-group')).toHaveLength(3);
        expect([...root.querySelectorAll('[data-story-row]')].map(item => item.getAttribute('data-story-row'))).toEqual(data.rows.map(item => item.id));
        expect(root.querySelector('#story-row-patch-trailer')).not.toBeNull();
        expect(root.querySelector('.patch-group-heading a')?.getAttribute('href')).toBe('https://example.com/notes');
        expect(root.querySelector('.patch-row-description')?.textContent).toContain('Official update information.');
        expect(data).toEqual(before);
    });
    it('keeps canonical counters when hiding completed rows and emits the original row on toggle', () => {
        const { fixture, component, root, data, entry } = setup();
        const toggled = vi.fn();
        component.toggled.subscribe(toggled);
        const input = root.querySelector<HTMLInputElement>('#story-row-patch-notes-row input')!;
        input.click();
        expect(toggled).toHaveBeenCalledWith(data.rows[0]);
        expect(input.checked).toBe(false);
        fixture.componentRef.setInput('entry', { ...entry, storyRowCompletion: { ...entry.storyRowCompletion, 'notes-row': true } });
        fixture.detectChanges();
        expect(input.checked).toBe(true);
        expect(component.groupProgress('notes')).toEqual({ completed: 1, total: 1, percent: 100 });
        fixture.componentRef.setInput('incompleteOnly', true);
        fixture.detectChanges();
        expect(root.querySelector('#story-row-patch-trailer')).toBeNull();
        expect(component.groupProgress('trailers')).toEqual({ total: 1, completed: 1, percent: 100 });
        expect(component.groupProgress('music')).toEqual({ total: 1, completed: 0, percent: 0 });
    });
    it('shows provider icons without video previews, preserves stored metadata, and collapses accessibly', () => {
        const { fixture, root, component, data } = setup();
        const trailer = root.querySelector('#story-row-patch-trailer')!;
        expect(trailer.textContent).not.toContain('02:36');
        expect(trailer.textContent).toContain('YouTube');
        expect(root.querySelector('.patch-media-thumbnail')).toBeNull();
        expect(trailer.querySelector('img')).toBeNull();
        expect(trailer.querySelector('.patch-media-provider.youtube svg path')).not.toBeNull();
        expect(trailer.querySelector('.patch-media-provider')?.textContent?.trim()).toBe('YouTube');
        expect(data.rows[1].thumbnailUrl).toBe('https://example.com/thumb.webp');
        expect(data.rows[1].duration).toBe('02:36');
        const toggle = root.querySelector<HTMLButtonElement>('[aria-label="Toggle Trailers & Teasers"]')!;
        toggle.click();
        fixture.detectChanges();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(root.querySelector('#guide-group-patch-trailers')?.hasAttribute('inert')).toBe(true);
        expect(component.mediaProvider({ ...data.rows[1], contentUrl: 'https://youtube.com.evil.example/video' })?.kind).toBe('website');
        expect(component.mediaProvider({ ...data.rows[1], contentUrl: 'javascript' + ':alert(1)' })).toBeNull();
    });
    it('leaves other template layouts unchanged', () => {
        const { fixture, entry, root } = setup();
        fixture.componentRef.setInput('entry', { ...entry, category: 'lore', lore: entry.patchOverview });
        fixture.detectChanges();
        expect(root.querySelector('.patch-media-panel')).toBeNull();
        expect(root.querySelector('.patch-group-heading')).toBeNull();
        expect(root.querySelectorAll('.guide-content-section')).toHaveLength(5);
    });
});
