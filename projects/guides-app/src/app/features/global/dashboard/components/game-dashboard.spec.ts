import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GameDashboard } from './game-dashboard';
import { DashboardData } from '../state/dashboard-data';
import { WorkspaceStore } from '../../../../core/state/workspace.store';
import { defaultGameOverview } from '@common/workspace/game-overview';
import type { DashboardGame, DashboardSummary } from '@lib/types/dashboard.type';
import type { Entry } from '@lib/types/workspace.type';

describe('Game dashboard', () => {
    const event = (id: string, extra: Partial<Entry> = {}): Entry => ({ id, game: 'genshin', kind: 'events', name: id,
        category: 'temporary', eventType: 'temporary', completed: false, startDate: '2026-11-01', endDate: '2026-12-01',
        order: 0, quantity: 0, target: 0, rarity: 1, day: '', notes: '', members: [], requirements: [], ...extra });
    function setup() {
        const game = defaultGameOverview('genshin');
        const summary: DashboardGame = { game, version: 'Current patch', versionNumber: '6.2', story: { total: 2, completed: 1, started: true,
            resume: { id: 'quest', name: 'Region / Quest', section: 'region', fragment: 'story-row-quest-row', total: 2, completed: 1 } },
            patch: { id: 'patch', name: 'Current patch', section: 'region', fragment: 'story-template-patch', total: 1, completed: 0 }, achievements: { total: 0, completed: 0 },
            inventory: { total: 2, sufficient: 0, partial: 0, missing: 0, notRequired: 2 }, plans: [], planCount: 0 };
        const data = { summary: signal<DashboardSummary>({ games: [summary], errors: [], generatedAt: '' }), summaryLoading: signal(false), eventsLoading: signal(false),
            summaryError: signal(''), eventsError: signal(''), events: signal({ errors: [] as {gameId:string;message:string}[] }), saveError: signal(''), saving: signal(false),
            refreshSummary: vi.fn(), refreshEvents: vi.fn(), toggle: vi.fn() };
        const store = { canEdit: signal(false), loading: signal(false) };
        TestBed.configureTestingModule({ providers: [provideRouter([]), {provide: DashboardData,useValue:data}, {provide:WorkspaceStore,useValue:store}] });
        const fixture = TestBed.createComponent(GameDashboard);
        fixture.componentRef.setInput('game', game); fixture.componentRef.setInput('now', new Date(2026, 10, 26, 12).getTime()); fixture.detectChanges();
        return {fixture,page:fixture.componentInstance,root:fixture.nativeElement as HTMLElement,data,store,game};
    }
    it('integrates the linked version and uses editor-only compact settings, with no standalone patch widget', () => {
        const {fixture,root,store} = setup();
        expect(root.querySelector('.version')?.getAttribute('href')).toContain('story-template-patch');
        expect(root.querySelector('.version')?.textContent).toContain('Version 6.2');
        expect(root.querySelector('.settings-button')).toBeNull();
        store.canEdit.set(true);fixture.detectChanges();expect(root.querySelector('.settings-button')).not.toBeNull();
        expect(root.querySelector('[aria-label="Patch Overview"]')).toBeNull();
        expect(root.querySelector('.summary-achievements')).toBeNull();
    });
    it('uses canonical resume fragments and distinguishes start, resume and completion', () => {
        const {fixture,root,data} = setup();
        expect(root.querySelector('.story-resume a')?.textContent).toContain('Resume Story');
        expect(root.querySelector('.story-resume a')?.getAttribute('href')).toContain('story-row-quest-row');
        data.summary.update(value=>({...value,games:value.games.map(item=>({...item,story:{...item.story!,started:false,completed:0}}))}));fixture.detectChanges();
        expect(root.querySelector('.story-resume a')?.textContent).toContain('Start Story');
        data.summary.update(value=>({...value,games:value.games.map(item=>({...item,story:{...item.story!,completed:2}}))}));fixture.detectChanges();
        expect(root.querySelector('.story-resume a')?.textContent).toContain('Review Story');
    });
    it('deduplicates scheduled tasks from timed events, excludes routine tasks and sorts deadlines', () => {
        const {fixture,page,root} = setup();
        const entries = [event('today'),event('later'),event('soon',{endDate:'2026-11-27'}),event('daily',{eventType:'daily'}),event('weekly',{eventType:'weekly'}),
            event('permanent',{eventType:'permanent'}),event('future',{startDate:'2026-11-28'}),event('done',{completed:true}),event('foreign',{game:'hsr'})];
        fixture.componentRef.setInput('events',entries);fixture.componentRef.setInput('tasks',[entries[0]]);fixture.detectChanges();
        expect(page.eventItems().map(item=>item.id)).toEqual(['soon','later']);
        expect(page.statistics().find(item=>item.key==='events')?.value).toBe('4');
        const upcoming = [...root.querySelectorAll<HTMLButtonElement>('.segmented button')].find(button=>button.textContent==='Upcoming')!;
        upcoming.click();fixture.detectChanges();expect(page.eventItems().map(item=>item.id)).toEqual(['future']);
        expect(root.querySelector('.completed-group')?.textContent).toContain('done');
    });
    it('collapses completed tasks but lets the user reverse completion through the existing transport', async () => {
        const {fixture,root,data} = setup();
        const done=event('done',{completed:true});fixture.componentRef.setInput('tasks',[done]);fixture.detectChanges();
        expect(root.querySelector('.events-panel')?.textContent).toContain('All tasks completed');
        const details=root.querySelector<HTMLDetailsElement>('.events-panel details')!;
        expect(details.open).toBe(false);details.open=true;
        details.querySelector<HTMLInputElement>('.dashboard-event-completion')!.click();await fixture.whenStable();
        expect(data.toggle).toHaveBeenCalledWith(done);
    });
    it('supports inventory alone without reserving disabled feature widgets or empty progress statistics', () => {
        const {fixture,root,game,page} = setup();
        fixture.componentRef.setInput('game',{...game,features:{inventory:game.features.inventory}});fixture.detectChanges();
        expect(page.statistics()).toHaveLength(0);
        expect(root.querySelector('.continue-story,.events-panel,.characters-panel,.achievements-panel')).toBeNull();
        expect(root.querySelector('.plans-panel')?.textContent).toContain('2 inventory items');
        expect(root.querySelector('.empty-plan')).toBeNull();
        expect(root.querySelector('.feature-links')?.textContent).not.toContain('Farming');
    });
    it('keeps request errors distinct from empty data and does not leak a previous game on switching', () => {
        const {fixture,root,data,page} = setup();
        data.eventsError.set('Calendar offline');fixture.detectChanges();
        expect(root.querySelector('.events-panel')?.textContent).toContain('Calendar offline');
        expect(root.querySelector('.events-panel')?.textContent).not.toContain('No tasks scheduled');
        expect(root.querySelector('.continue-story')).not.toBeNull();
        fixture.componentRef.setInput('game',defaultGameOverview('hsr'));fixture.detectChanges();
        expect(page.summary()).toBeUndefined();expect(root.querySelector('.version')).toBeNull();expect(root.textContent).not.toContain('Region / Quest');
    });
    it('prioritizes started permanent activities, caps incomplete entries and retains completed access', () => {
        const {fixture,page,data,root}=setup();
        data.summary.update(value=>({...value,games:value.games.map(item=>({...item,activities:Array.from({length:8},(_,index)=>({id:String(index),name:String(index),total:2,completed:index===7?2:index===6?1:0}))}))}));fixture.detectChanges();
        expect(page.incompleteActivities()).toHaveLength(4);expect(page.incompleteActivities()[0].id).toBe('6');
        expect(root.querySelector('.activities-panel details')?.textContent).toContain('1 completed activities');
    });
});
