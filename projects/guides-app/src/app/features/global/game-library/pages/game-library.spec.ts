import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { GameLibraryPage } from './game-library';
import { WorkspaceStore } from '../../../../core/state/workspace.store';
import { AuthStore } from '../../../../core/auth/auth.store';
import { defaultGameOverview } from '@common/workspace/game-overview';
@Component({selector:'gg-library-test-target',template:''}) class Target {}
describe('Game library views',()=>{
 beforeEach(()=>{const map=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>map.set(key,value)});});
 afterEach(()=>vi.unstubAllGlobals());
 async function setup(url='/library',count=3) {
    const games=Array.from({length:count},(_,index)=>({...defaultGameOverview('game-'+index),name:`Game ${String(index).padStart(3,'0')}`,genres:index%2?['RPG','JRPG']:['Strategy']}));
    TestBed.configureTestingModule({providers:[provideRouter([{path:'**',component:Target}]),{provide:AuthStore,useValue:{user:signal(null)}},{provide:WorkspaceStore,useValue:{games:signal(games),canEdit:signal(false),initialized:signal(true),loading:signal(false)}}]});
    const router=TestBed.inject(Router);await router.navigateByUrl(url);const fixture=TestBed.createComponent(GameLibraryPage);fixture.detectChanges();await fixture.whenStable();return {fixture,page:fixture.componentInstance,root:fixture.nativeElement as HTMLElement,router};
 }
 it('bounds initial rendering for hundreds of games and shares search, sorting and filters between grid/list',async()=>{
    const {fixture,page,root}=await setup('/library',300);expect(page.visible()).toHaveLength(300);expect(root.querySelectorAll('gg-game-card')).toHaveLength(48);
    expect(root.querySelector('.library-views [aria-current=page]')?.textContent).toBe('All Games');
    page.type.set('RPG');page.search.set('Game 001');fixture.detectChanges();expect(page.visible().every(game=>game.genres.includes('RPG'))).toBe(true);expect(page.visible().some(game=>game.name==='Game 001')).toBe(true);
    const ids=page.visible().map(game=>game.gameId);page.preference('viewMode','list');fixture.detectChanges();expect(page.visible().map(game=>game.gameId)).toEqual(ids);expect(root.querySelector('.game-library-list')).not.toBeNull();
    expect(root.querySelector('.library-actions .primary')).toBeNull();
    page.search.set('');page.type.set('JRPG');fixture.detectChanges();
    expect(page.types()).toEqual(['JRPG','RPG','Strategy']);
    expect(page.visible()).toHaveLength(150);
 });
 it('uses route-driven favorite and collection views without duplicating shared game definitions',async()=>{
    const {page,router,fixture,root}=await setup();page.preferences.toggleFavorite('game-1');await router.navigateByUrl('/library/favorites');fixture.detectChanges();expect(page.visible().map(game=>game.gameId)).toEqual(['game-1']);
    expect(root.querySelectorAll('.library-views [aria-current=page]')).toHaveLength(1);
    expect(root.querySelector('.library-views .active')?.textContent).toBe('Favorites');
    const collection={...page.preferences.addCollection(),label:'Playing',gameIds:['game-2']};await page.preferences.saveCollections([collection]);await router.navigateByUrl('/library/collections/'+collection.id);fixture.detectChanges();expect(page.title()).toBe('Playing');expect(page.visible().map(game=>game.gameId)).toEqual(['game-2']);
    await page.preferences.saveCollections([]);expect(page.store.games()).toHaveLength(3);expect(page.visible()).toEqual([]);expect(page.title()).toContain('not found');
 });
 it('does not ask to discard unchanged collection drafts and preserves changes until saved',async()=>{
    const {page}=await setup();page.beginCollections();page.closeCollections();expect(page.confirmation()).toBeNull();
    page.beginCollections();page.addCollection();page.closeCollections();expect(page.confirmation()?.message).toContain('Discard');expect(page.editing()).not.toBeNull();expect(page.preferences.library().collections).toEqual([]);page.confirmation.set(null);
    page.editing()![0].label='Playing';await page.saveCollections();expect(page.editing()).toBeNull();expect(page.preferences.library().collections[0].label).toBe('Playing');
 });
});
