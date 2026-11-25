import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { PatchOverviewTemplate } from './patch-overview';
import { Story } from '../../../pages/story-guide/story';
import { WorkspaceStore } from '../../../../../../core/state/workspace.store';
import type { Entry } from '@lib/types/workspace.type';
import { emptyPatchOverview } from '@common/quests/story-template';
import { StoryContextEditor } from '../../context-editor/story-context-editor';
import { StoryAvailability } from '@lib/enums/story-tracking.enum';

const entry: Entry = { id: 'activity', game: 'endfield', kind: 'story', category: 'endgame-activity', name: 'Combat Simulation', notes: '', quantity: 0, target: 0, completed: false, rarity: 1, members: [], requirements: [], order: 0, day: '', storyRowCompletion: { first: true },
    eventStory: { ...emptyPatchOverview(), imageUrl: 'https://example.com/art.webp', sourceName: 'Artist', sourceUrl: 'https://example.com',
        groups: [{ id: 'objectives', title: 'Combat Simulation' }, { id: 'challenges', title: 'Extra Challenges' }], rows: [
            { id: 'first', groupId: 'objectives', content: 'First objective', contentType: '', patch: '1.0', notes: 'Extra advice' },
            { id: 'second', groupId: 'challenges', content: 'Extra objective', contentType: '', patch: '1.0', notes: '' },
        ] } };

describe('End-game activities and draft conversions', () => {
    it('excludes event metadata and event linking while preserving previously stored dates', () => {
        TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: { saving: () => false, loading: () => false } }] });
        const fixture = TestBed.createComponent(PatchOverviewTemplate);
        const source = structuredClone(entry);
        const context = { availability: StoryAvailability.Limited, startDate: '2026-11-01', endDate: '2026-12-01', resetSchedule: 'Every Monday' };
        source.eventStory!.context = structuredClone(context);
        fixture.componentRef.setInput('entry', source); fixture.componentRef.setInput('editing', true); fixture.detectChanges();
        fixture.componentInstance.selectTemplateDetails(); fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        expect(root.querySelector('input[type=date]')).toBeNull();
        const labels = [...root.querySelectorAll('label, legend')].map(element => element.textContent?.trim());
        expect(labels.some(label => /^(Availability|Start date|End date|Reset schedule|Current cycle|Completion tracking|Shared Activity)/.test(label ?? ''))).toBe(false);
        expect(fixture.componentInstance.data().context).toEqual(context);
        fixture.componentRef.setInput('editing', false); fixture.detectChanges();
        expect(root.querySelector('.endgame-header')?.textContent).not.toContain('Limited-time');
        expect(root.querySelector('.endgame-header')?.textContent).not.toContain('2026');
        expect(fixture.componentInstance.data().context).toEqual(context);
    });
    it('keeps the displayed template synchronized on open, pending conversion, confirmation, undo and reopening', async () => {
        const original = structuredClone(entry);
        const save = vi.fn();
        TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: WorkspaceStore, useValue: {
            entries: signal([original]), initialized: signal(true), loading: signal(false), saving: signal(false), save,
        } }] });
        const fixture = TestBed.createComponent(Story);
        fixture.componentRef.setInput('game', 'endfield');
        const component = fixture.componentInstance;
        fixture.detectChanges(); await fixture.whenStable();
        component.editMode.set(true); component.open('story', original);
        const render = async () => { fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); await fixture.whenStable(); };
        const select = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('select[name=topic]')!;
        await render();
        expect(select().value).toBe('endgame-activity');
        const choose = async (value: string) => { select().value = value; select().dispatchEvent(new Event('change', { bubbles: true })); await render(); };
        await choose('divider');
        expect(component.pendingConversion).not.toBeNull();
        expect(component.editor?.category).toBe('endgame-activity'); expect(select().value).toBe('endgame-activity');
        component.pendingConversion = null; await render();
        expect(select().value).toBe('endgame-activity');
        await choose('events');
        expect(component.pendingConversion).not.toBeNull();
        expect(select().value).toBe('endgame-activity');
        component.applyConversion(); expect(component.editor?.category).toBe('events'); await render();
        expect(component.editor?.category).toBe('events');
        const child = fixture.debugElement.query(element => element.name === 'gg-patch-overview').componentInstance as PatchOverviewTemplate;
        expect(child.entry().category).toBe('events'); expect(select().value).toBe('events');
        component.undoTemplateConversion(); await render(); expect(select().value).toBe('endgame-activity');
        component.editor = null; await render(); component.open('story', { ...original, category: 'events' }); await render();
        expect(select().value).toBe('events');
        await choose('endgame-activity');
        expect(component.pendingConversion).toBeNull(); expect(select().value).toBe('endgame-activity');
        expect(save).not.toHaveBeenCalled();
    });
    it('displays date controls without replacing existing timestamp deadlines until edited', async () => {
        const fixture = TestBed.createComponent(StoryContextEditor);
        const context = { startDate: '2026-11-01T23:00:00-05:00', endDate: '2026-12-01T23:00:00-05:00' };
        fixture.componentRef.setInput('context', context);
        fixture.componentRef.setInput('inline', true);
        fixture.detectChanges(); await fixture.whenStable();
        const dates = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input[type=date]');
        expect(dates[0].value).toBe('2026-11-01'); expect(dates[1].value).toBe('2026-12-01');
        expect(context.endDate).toBe('2026-12-01T23:00:00-05:00');
        dates[1].value = '2026-12-02'; dates[1].dispatchEvent(new Event('input', { bubbles: true }));
        expect(context.endDate).toBe('2026-12-02');
    });
    it('reuses table rows, attribution and independent collapse controls with optional supporting art', () => {
        const save = vi.fn();
        TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: { save, saving: () => false, loading: () => false } }] });
        const fixture = TestBed.createComponent(PatchOverviewTemplate);
        fixture.componentRef.setInput('entry', structuredClone(entry));
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        expect(root.querySelector('.endgame-activity.with-artwork')).not.toBeNull();
        expect(root.querySelector('.patch-hero, .guide-event-info')).toBeNull();
        expect(root.querySelector('.endgame-art img')?.getAttribute('src')).toBe(entry.eventStory!.imageUrl);
        expect(root.querySelector('.endgame-art a')?.getAttribute('href')).toBe(new URL(entry.eventStory!.sourceUrl).href);
        expect(root.querySelector('.guide-section-heading h4')?.textContent?.trim()).toBe('Objectives');
        expect(root.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked).toBe(true);
        const toggles = root.querySelectorAll<HTMLButtonElement>('.guide-section-heading button');
        toggles[0].click(); fixture.detectChanges();
        expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
        expect(toggles[1].getAttribute('aria-expanded')).toBe('true');
        fixture.componentInstance.failedImage.set(entry.eventStory!.imageUrl); fixture.detectChanges();
        expect(root.querySelector('.with-artwork')).toBeNull();
        expect(root.querySelector('.endgame-art')).toBeNull();
        expect(save).not.toHaveBeenCalled();
    });

    it('confirms unsupported content, supports undo, and leaves persisted records untouched on cancel', () => {
        const save = vi.fn();
        const original = { ...structuredClone(entry), category: 'events', eventStory: { ...structuredClone(entry.eventStory!), damageType: 'Physical' } };
        TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: WorkspaceStore, useValue: {
            entries: signal([original]), initialized: signal(true), loading: signal(false), saving: signal(false), save,
        } }] });
        const fixture = TestBed.createComponent(Story);
        fixture.componentRef.setInput('game', 'endfield');
        const component = fixture.componentInstance;
        component.editMode.set(true); component.open('story', original);
        const before = structuredClone(component.editor);
        component.requestTemplate(component.editor!, 'endgame-activity');
        expect(component.pendingConversion).not.toBeNull();
        expect(component.editor?.category).toBe('events');
        component.applyConversion();
        expect(component.editor?.storyContent?.rows.map(row => row.id)).toEqual(['first', 'second']);
        component.undoTemplateConversion();
        expect(component.editor).toEqual(before);
        component.requestTemplate(component.editor!, 'endgame-activity'); component.applyConversion(); component.editor = null;
        expect(original.category).toBe('events'); expect(original.eventStory.rows).toHaveLength(2);
        expect(save).not.toHaveBeenCalled();
    });
});
