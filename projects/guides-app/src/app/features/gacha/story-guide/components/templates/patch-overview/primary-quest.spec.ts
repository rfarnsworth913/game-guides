import { TestBed } from '@angular/core/testing';
import { PatchOverviewTemplate } from './patch-overview';
import { WorkspaceStore, type Entry } from '../../../../../../core/state/workspace.store';
import { emptyPatchOverview } from '../../../../../../../../../common/quests/story-template';

describe('Primary quest reading layout', () => {
    it('preserves artwork attribution, linked quest headings and completion within the shared card layout', () => {
        const save = vi.fn();
        TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: { save, saving: () => false, loading: () => false } }] });
        const data = { ...emptyPatchOverview(), patchVersion: '1.0', region: 'Old region label',
            imageUrl: 'https://example.com/art.webp', sourceName: 'Official artwork', sourceUrl: 'https://example.com/source',
            groups: [{ id: 'quest', title: 'Prologue', mainQuest: { id: 'parent', content: 'Prologue', contentUrl: 'https://example.com/prologue', contentType: '', patch: '1.0', notes: '' } }],
            rows: ['Cold Start', 'Awakening'].map((content, index) => ({ id: `row-${index}`, groupId: 'quest', content, contentUrl: `https://example.com/quest-${index}`, contentType: '', patch: '1.0', notes: '' })) };
        const entry: Entry = { id: 'prologue', game: 'endfield', kind: 'story', category: 'main-story', name: 'Prologue', notes: '', rarity: 1, members: [], requirements: [], order: 0, day: '', completed: false, quantity: 0, target: 0, mainStory: data, storyRowCompletion: { 'row-0': true } };
        const before = structuredClone(data);
        const fixture = TestBed.createComponent(PatchOverviewTemplate);
        fixture.componentRef.setInput('entry', entry); fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        expect(root.querySelector('.patch-game-name')?.textContent).toContain('Arknights');
        expect(root.querySelector('.patch-game-name')?.textContent).not.toContain('Old region label');
        expect(root.querySelector('.patch-hero h3')?.textContent).toBe('Prologue');
        expect(root.querySelector('.quest-banner-patch')?.textContent).toContain('1.0');
        expect(root.querySelector('.patch-banner')?.getAttribute('src')).toBe(data.imageUrl);
        expect(root.querySelector('.patch-source a')?.getAttribute('href')).toBe(data.sourceUrl);
        expect(root.querySelector('.primary-quest-reading.patch-reading-view')).not.toBeNull();
        expect(root.querySelector('.guide-main-quest-heading h4 a')?.getAttribute('href')).toBe('https://example.com/prologue');
        expect(root.querySelector('.guide-main-quest-progress strong')?.textContent).toBe('1 / 2');
        expect(root.querySelector('.guide-main-quest-progress small')?.textContent).toBe('50%');
        const checkboxes = root.querySelectorAll<HTMLInputElement>('.guide-row-tracking input');
        expect(checkboxes).toHaveLength(2); expect(checkboxes[0].checked).toBe(true);
        const toggle = root.querySelector<HTMLButtonElement>('.guide-main-quest-heading button')!;
        toggle.click(); fixture.detectChanges();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(root.querySelector('.guide-section-content')?.hasAttribute('inert')).toBe(true);
        expect(data).toEqual(before); expect(save).not.toHaveBeenCalled();
    });
});
