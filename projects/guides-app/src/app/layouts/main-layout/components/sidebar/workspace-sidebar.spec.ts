import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { WorkspaceSidebar } from './workspace-sidebar';
import { WorkspaceStore } from '../../../../core/state/workspace.store';
import { AuthStore } from '../../../../core/auth/auth.store';
import { GameNavigationPreferences } from '../../../../core/state/game-navigation-preferences';
import { defaultGameOverview } from '@common/workspace/game-overview';
@Component({selector:'gg-library-test-target',template:''}) class Target {}
describe('Scalable game navigation',()=>{
 beforeEach(()=>{const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});});
 afterEach(()=>vi.unstubAllGlobals());
 async function setup(active:string|null=null,url='/library') {
    const games=['genshin','hsr','endfield'].map(defaultGameOverview);
    TestBed.configureTestingModule({providers:[provideRouter([{path:'**',component:Target}]),{provide:AuthStore,useValue:null},{provide:WorkspaceStore,useValue:{games:signal(games),canEdit:signal(false),initialized:signal(true),loading:signal(false)}}]});
    const router=TestBed.inject(Router);await router.navigateByUrl(active?`/games/${active}/story`:url);
    const fixture=TestBed.createComponent(WorkspaceSidebar);fixture.componentRef.setInput('catalog',games);fixture.componentRef.setInput('activeGameId',active);fixture.detectChanges();await fixture.whenStable();
    return {fixture,component:fixture.componentInstance,root:fixture.nativeElement as HTMLElement,router,prefs:TestBed.inject(GameNavigationPreferences)};
 }
 it('does not render the full catalog and keeps library organization separate from selected-game navigation',async()=>{
    const {fixture,root,prefs}=await setup();
    expect(root.querySelector('.game-list')).toBeNull();expect(root.querySelectorAll('.compact-games a')).toHaveLength(0);
    prefs.togglePin('genshin');prefs.remember('hsr','story');fixture.detectChanges();await fixture.whenStable();
    expect(root.querySelector('[aria-label="Pinned games"]')?.textContent).toContain('Genshin');expect(root.querySelector('[aria-label="Recent games"]')?.textContent).toContain('Honkai');
    fixture.componentRef.setInput('activeGameId','genshin');fixture.detectChanges();
    expect(root.querySelector('a[href="/games/genshin/story"]')).not.toBeNull();expect(root.querySelector('[aria-label="Pinned games"]')).toBeNull();
 });
 it('pins and favorites are independent, recent entries exclude pins and reordering changes only personal state',async()=>{
    const {fixture,component,prefs,root}=await setup();prefs.toggleFavorite('genshin');prefs.togglePin('hsr');prefs.togglePin('endfield');prefs.remember('hsr');fixture.detectChanges();
    expect(prefs.pinnedGameIds()).toEqual(['hsr','endfield']);expect(prefs.favoriteGameIds()).toEqual(['genshin']);expect(root.querySelector('[aria-label="Recent games"]')).toBeNull();
    component.dragging='endfield';component.drop('hsr');expect(prefs.pinnedGameIds()).toEqual(['endfield','hsr']);
    expect(component.catalog()[0].gameId).toBe('genshin');
 });
 it.each(['/dashboard','/events'])('shows workspace links and personal game shortcuts on %s',async(url)=>{
    const {fixture,root,prefs}=await setup(null,url);
    prefs.togglePin('genshin');prefs.remember('hsr','story');fixture.detectChanges();await fixture.whenStable();
    expect(root.querySelector('a[href="/dashboard"]')).not.toBeNull();
    expect(root.querySelector('a[href="/events"]')).not.toBeNull();
    expect(root.querySelector('a[href="/library"] .count')?.textContent).toBe('3');
    expect(root.querySelector('a[href="'+url+'"].active')).not.toBeNull();
    expect(root.querySelector('[aria-label="Pinned games"]')?.textContent).toContain('Genshin');
    expect(root.querySelector('[aria-label="Recent games"]')?.textContent).toContain('Honkai');
    expect(root.querySelectorAll('.section-toggle svg')).toHaveLength(2);
    expect(root.querySelector('a[href="/library/favorites"]')).toBeNull();
    root.querySelector<HTMLButtonElement>('[aria-controls=sidebar-pinned-games]')!.click();fixture.detectChanges();
    expect(root.querySelector('[aria-label="Pinned games"]')).toBeNull();
    expect(prefs.library().preferences.collapsedSections.pinnedGames).toBe(true);
 });
 it('uses the shared feature registry and hides disabled/editor-only features from players',async()=>{
    const {fixture,component,root}=await setup('genshin');
    const game={...defaultGameOverview('genshin'),features:{story:{feature:'story' as const,visibility:'editors' as const},characters:{feature:'characters' as const,visibility:'public' as const}}};
    fixture.componentRef.setInput('catalog',[game]);fixture.detectChanges();
    expect(root.querySelector('a[href="/games/genshin/story"]')).toBeNull();expect(root.querySelector('a[href="/games/genshin/characters"]')).not.toBeNull();expect(component.workspaceLinks()).toHaveLength(1);
    expect(root.querySelectorAll('.game-nav-divider')).toHaveLength(1);
 });
 it('groups game links in reading, collection and other sections without empty dividers',async()=>{
    const {fixture,root}=await setup('genshin');
    const destinations=()=>Array.from(root.querySelectorAll('.game-navigation a')).map(link=>link.getAttribute('href')?.split('/').pop());
    expect(destinations()).toEqual(['dashboard','events','story','characters','teams','inventory','plans','achievements','farming']);
    expect(root.querySelectorAll('.game-nav-divider')).toHaveLength(2);
    fixture.componentRef.setInput('catalog',[{...defaultGameOverview('genshin'),features:{}}]);fixture.detectChanges();
    expect(destinations()).toEqual(['dashboard']);expect(root.querySelector('.game-nav-divider')).toBeNull();
 });
 it('switches to the current feature when supported, falls back to the previous accessible feature, and retains the route on cancellation',async()=>{
    const {component,router,prefs}=await setup('genshin');
    const spy=vi.spyOn(router,'navigateByUrl').mockResolvedValue(true);await component.navigation.select('hsr');expect(spy).toHaveBeenCalledWith('/games/hsr/story');
    component.navigation.store.games.set([{...defaultGameOverview('hsr'),features:{events:{feature:'events',visibility:'public'}}}]);
    prefs.remember('hsr','events');await component.navigation.select('hsr');expect(spy).toHaveBeenLastCalledWith('/games/hsr/events');
    spy.mockResolvedValue(false);component.navigation.open();await component.navigation.select('hsr');expect(component.navigation.opened()).toBe(true);expect(component.navigation.error()).toContain('cancelled');
 });
});
