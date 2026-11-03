import { Injector, runInInjectionContext } from '@angular/core';
import { AuthStore } from '../../../../../core/auth/auth.store';
import { TestBed } from '@angular/core/testing';
import { ProgressionPage } from './progression';
import { WorkspaceStore, GAMES, type Entry } from '../../../../../core/state/workspace.store';

describe('Progression feature', () => {
    it('keeps plan filtering and edit/delete actions scoped to the current game', () => {
        const store = runInInjectionContext(Injector.create({ providers: [{ provide: AuthStore, useValue: null }] }), () => new WorkspaceStore());
        const plan: Entry = { id: 'plan', kind: 'plans', game: 'genshin', name: 'First plan', notes: '', order: 0,
            category: 'Build', day: '', rarity: 1, quantity: 0, target: 1, completed: false, members: [], requirements: [] };
        store.entries.set([plan, { ...plan, id: 'other', game: 'hsr' }]);
        TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: store }] });
        const fixture = TestBed.createComponent(ProgressionPage);
        fixture.componentRef.setInput('context', GAMES.find(game => game.id === 'genshin'));
        fixture.detectChanges();
        expect(fixture.componentInstance.rows()).toEqual([plan]);
        let edited: Entry | undefined;
        let removed: Entry | undefined;
        fixture.componentInstance.editEntry.subscribe(value => { edited = value.entry; });
        fixture.componentInstance.removeEntry.subscribe(value => { removed = value; });
        const root = (fixture.nativeElement as HTMLElement) as HTMLElement;
        const edit = [...root.querySelectorAll<HTMLButtonElement>('.entry-actions button')].find(button => button.textContent?.trim() === 'Edit')!;
        edit.click();
        root.querySelector<HTMLButtonElement>('.entry-actions .delete')!.click();
        expect(edited).toBe(plan);
        expect(removed).toBe(plan);
        fixture.componentInstance.search.set('missing');
        fixture.detectChanges();
        expect(root.textContent).toContain('No matching entries');
    });
});
