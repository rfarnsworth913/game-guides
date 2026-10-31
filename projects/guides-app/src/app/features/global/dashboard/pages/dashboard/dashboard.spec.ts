import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { DashboardPage } from './dashboard';
import { WorkspaceStore, GAMES, type Entry } from '../../../../../core/state/workspace.store';
import { StoryPositionStore } from '../../../../gacha/story-guide/state/story-position.store';

describe('Dashboard feature ownership', () => {
    it('scopes summaries to the selected game and emits plan editing to the shell', () => {
        const store = new WorkspaceStore();
        const entry = (id: string, game: string, kind: Entry['kind']): Entry => ({
            id, game, kind, name: id, category: '', notes: '', order: 0, rarity: 1, day: '',
            members: [], requirements: [], quantity: 0, target: 1, completed: false,
            ...(kind === 'characters' ? { characterCollection: { owned: true, level: 1, gear: {}, progression: {}, notes: '' } } : {}),
        });
        const plan = entry('Plan', 'genshin', 'plans');
        store.entries.set([entry('One', 'genshin', 'characters'), entry('Two', 'hsr', 'characters'), plan]);
        TestBed.configureTestingModule({ providers: [provideRouter([]),
            { provide: WorkspaceStore, useValue: store },
            { provide: StoryPositionStore, useValue: { positions: signal({}) } },
        ] });
        const fixture = TestBed.createComponent(DashboardPage);
        fixture.detectChanges();
        expect(fixture.componentInstance.count('characters')).toBe(2);
        fixture.componentRef.setInput('context', GAMES.find(game => game.id === 'genshin'));
        fixture.detectChanges();
        expect(fixture.componentInstance.count('characters')).toBe(1);
        expect(fixture.componentInstance.dashboardStories().map(game => game.id)).toEqual(['genshin']);
        let selected: Entry | undefined;
        fixture.componentInstance.editPlan.subscribe(value => { selected = value; });
        (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.plan-row')!.click();
        expect(selected).toBe(plan);
    });
});
