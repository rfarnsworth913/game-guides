import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../auth/auth.store';
import { GameNavigationPreferences } from './game-navigation-preferences';
import { emptyGameLibrary } from '@common/workspace/game-library';
import type { UserGameLibrary } from '@lib/types';
describe('Personal game library synchronization',()=>{
 beforeEach(()=>vi.stubGlobal('localStorage',{getItem:()=>null,setItem:vi.fn()}));afterEach(()=>vi.unstubAllGlobals());
 it('clears a pending account load on logout and ignores its late response',async()=>{
    const user=signal<{id:string}|null>({id:'alice'});
    let finish:(response:Response)=>void=()=>{};
    const request=vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve;}));
    TestBed.configureTestingModule({providers:[{provide:AuthStore,useValue:{user,request}}]});
    const library=TestBed.inject(GameNavigationPreferences);TestBed.tick();
    expect(library.loading()).toBe(true);
    user.set(null);TestBed.tick();expect(library.loading()).toBe(false);
    const stale=emptyGameLibrary();stale.games.push({gameId:'hsr',isFavorite:true,isPinned:false});
    finish(new Response(JSON.stringify(stale)));
    await vi.waitFor(()=>expect(library.loading()).toBe(false));
    expect(library.favoriteGameIds()).toEqual([]);
 });
 async function setup(){
    const user=signal<{id:string}|null>({id:'alice'}),accounts=new Map<string,UserGameLibrary>();let fail=false;
    const request=vi.fn(async(_url:string,init?:RequestInit)=>{
        const owner=user()!.id;
        if(init?.method==='PUT') {if(fail) {return new Response(JSON.stringify({error:'Library changed in another tab.'}),{status:409});}
            const body=JSON.parse(init.body as string) as UserGameLibrary;const saved={...body,revision:body.revision+1};accounts.set(owner,saved);return new Response(JSON.stringify(saved));}
        return new Response(JSON.stringify(accounts.get(owner)??emptyGameLibrary()));
    });
    TestBed.configureTestingModule({providers:[{provide:AuthStore,useValue:{user,request}}]});const library=TestBed.inject(GameNavigationPreferences);TestBed.tick();await vi.waitFor(()=>expect(library.loading()).toBe(false));
    return {library,user,accounts,request,fail:()=>{fail=true;}};
 }
 it('serializes changes without losing favorites or pins and isolates sign-in changes',async()=>{
    const {library,user,accounts}=await setup();library.toggleFavorite('genshin');library.togglePin('hsr');await vi.waitFor(()=>expect(library.saving()).toBe(false));
    expect(accounts.get('alice')?.games.find(game=>game.gameId==='genshin')?.isFavorite).toBe(true);expect(accounts.get('alice')?.pinnedOrder).toEqual(['hsr']);
    user.set({id:'bob'});TestBed.tick();await vi.waitFor(()=>expect(library.loading()).toBe(false));expect(library.favoriteGameIds()).toEqual([]);expect(library.pinnedGameIds()).toEqual([]);
    user.set({id:'alice'});TestBed.tick();await vi.waitFor(()=>expect(library.loading()).toBe(false));expect(library.favoriteGameIds()).toEqual(['genshin']);expect(library.pinnedGameIds()).toEqual(['hsr']);
 });
 it('rolls back optimistic state on failed saves and retains the confirmed account data',async()=>{
    const {library,fail}=await setup();library.toggleFavorite('genshin');await vi.waitFor(()=>expect(library.saving()).toBe(false));fail();library.togglePin('hsr');expect(library.pinnedGameIds()).toEqual(['hsr']);
    await vi.waitFor(()=>expect(library.error()).toContain('another tab'));expect(library.pinnedGameIds()).toEqual([]);expect(library.favoriteGameIds()).toEqual(['genshin']);
 });
});
