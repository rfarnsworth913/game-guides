import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { GameSwitcher } from './game-switcher';
import { GameSwitcherControl } from '../../../core/state/game-switcher-control';
import { WorkspaceStore } from '../../../core/state/workspace.store';
import { AuthStore } from '../../../core/auth/auth.store';
import { defaultGameOverview } from '@common/workspace/game-overview';

@Component({selector:'gg-switcher-test-target',template:''}) class Target {}

describe('Game switcher keyboard navigation', () => {
    it('opens the searched game in the current feature after closing and reopening', async () => {
        TestBed.configureTestingModule({providers:[
            provideRouter([{path:'**',component:Target}]),
            {provide:AuthStore,useValue:{user:signal(null)}},
            {provide:WorkspaceStore,useValue:{games:signal([defaultGameOverview('genshin'),defaultGameOverview('hsr')]),canEdit:signal(false),initialized:signal(true),loading:signal(false)}}
        ]});
        const router=TestBed.inject(Router);
        await router.navigateByUrl('/games/genshin/story');
        const control=TestBed.inject(GameSwitcherControl);
        control.open();
        const fixture=TestBed.createComponent(GameSwitcher);
        fixture.detectChanges();await fixture.whenStable();
        const root=fixture.nativeElement as HTMLElement;
        root.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
        fixture.detectChanges();expect(control.opened()).toBe(false);
        control.open();fixture.detectChanges();await fixture.whenStable();
        const input=root.querySelector('input')!;
        input.value='hsr';input.dispatchEvent(new Event('input',{bubbles:true}));fixture.detectChanges();
        expect(root.querySelectorAll('[role=option]')).toHaveLength(1);
        const navigate=vi.spyOn(router,'navigateByUrl').mockResolvedValue(true);
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
        await fixture.whenStable();
        expect(navigate).toHaveBeenCalledWith('/games/hsr/story');
        expect(control.opened()).toBe(false);
    });
});
