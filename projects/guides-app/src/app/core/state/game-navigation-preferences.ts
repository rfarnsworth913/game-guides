import { computed, effect, inject, Injectable, signal, DestroyRef } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { AuthStore } from '../auth/auth.store';
import { WorkspaceApi } from './services/workspace-api';
import { emptyGameLibrary, validGameLibrary } from '@common/workspace/game-library';
import { validGameId } from '@common/workspace/game-overview';
import type { UserGameLibrary, UserGameCollection } from '@lib/types';
@Injectable({providedIn:'root'})
export class GameNavigationPreferences {
    private readonly window=inject(DOCUMENT).defaultView;
    private readonly auth=inject(AuthStore,{optional:true});
    private readonly api=new WorkspaceApi(this.auth);
    readonly library=signal<UserGameLibrary>(emptyGameLibrary());
    readonly loading=signal(false);
    readonly saving=signal(false);
    readonly error=signal('');
    readonly favoriteGameIds=computed(()=>this.library().games.filter(game=>game.isFavorite).map(game=>game.gameId));
    readonly pinnedGameIds=computed(()=>this.library().pinnedOrder);
    readonly recentGameIds=computed(()=>this.library().games.filter(game=>game.lastAccessedAt).sort((a,b)=>b.lastAccessedAt!.localeCompare(a.lastAccessedAt!)).map(game=>game.gameId));
    private owner='guest';
    private generation=0;
    private revision=0;
    private confirmed=emptyGameLibrary();
    private queue=Promise.resolve();
    private pending=0;
    private scope=new AbortController();
    constructor() {
        this.loadGuest();
        effect(()=>{const user=this.auth?.user()?.id??'guest';if(user!==this.owner) {this.switchOwner(user);}});
        const storage=(event:StorageEvent)=>{if(event.key===this.key() && !this.saving()) {this.reload().catch(()=>this.error.set('Could not reload your library.'));}};
        this.window?.addEventListener('storage',storage);inject(DestroyRef).onDestroy(()=>{this.scope.abort();this.window?.removeEventListener('storage',storage);});
    }
    private key():string {return `gg-game-library-v2:${encodeURIComponent(this.owner)}`;}
    private loadGuest():void {
        let library=emptyGameLibrary();
        try {
            const value:unknown=JSON.parse(this.window?.localStorage.getItem(this.key())??'null');
            if(validGameLibrary(value)) {library=value;}
            else {
                const old=JSON.parse(this.window?.localStorage.getItem('gg-game-navigation-v1')??'null') as {favorites?:unknown[];recent?:unknown[]}|null;
                if(old && 'version' in old && old.version===1) {
                    const ids=[...new Set([...(old?.favorites??[]),...(old?.recent??[])].filter(validGameId))];
                    library.games=ids.map(gameId=>({gameId,isFavorite:old?.favorites?.includes(gameId)??false,isPinned:false,...(old?.recent?.includes(gameId)?{lastAccessedAt:new Date(Date.now()-(old.recent.indexOf(gameId))).toISOString()}: {})}));
                }
            }
        } catch {/* Storage may be blocked. */}
        this.library.set(library);this.confirmed=structuredClone(library);this.revision=library.revision;
    }
    private switchOwner(owner:string):void {
        this.scope.abort();this.scope=new AbortController();
        this.owner=owner;this.generation++;this.queue=Promise.resolve();this.pending=0;this.loading.set(false);this.saving.set(false);this.error.set('');
        this.library.set(emptyGameLibrary());this.confirmed=emptyGameLibrary();this.revision=0;
        if(owner==='guest') {this.loadGuest();} else {this.reload().catch(()=>this.error.set('Could not load your library.'));}
    }
    async reload():Promise<void> {
        const generation=this.generation;
        if(this.owner==='guest') {this.loadGuest();return;}
        this.loading.set(true);
        try {const value=await this.api.request('me/game-library',globalThis.undefined,'GET',this.scope.signal);if(!validGameLibrary(value)) {throw new Error('Invalid personal library response.');}
            if(generation===this.generation) {this.library.set(value);this.confirmed=structuredClone(value);this.revision=value.revision;this.error.set('');}
        } catch(error) {if(generation===this.generation) {this.error.set(error instanceof Error?error.message:'Could not load your library.');}}
        finally {if(generation===this.generation) {this.loading.set(false);}}
    }
    update(change:(draft:UserGameLibrary)=>void):Promise<boolean> {
        if(this.loading() || this.error()) {return Promise.resolve(false);}
        const draft=structuredClone(this.library());change(draft);
        if(!validGameLibrary(draft)) {this.error.set('Check collection names, image URLs and membership.');return Promise.resolve(false);}
        this.library.set(draft);
        const generation=this.generation;
        if(this.owner==='guest') {
            this.confirmed=structuredClone(draft);
            try {this.window?.localStorage.setItem(this.key(),JSON.stringify(draft));} catch {/* Guest session remains usable. */}
            return Promise.resolve(true);
        }
        this.saving.set(true);this.pending++;
        const result=this.queue.then(async()=>{
            if(generation!==this.generation) {return false;}
            try {
                const saved=await this.api.request('me/game-library',{...draft,revision:this.revision},'PUT',this.scope.signal);
                if(!validGameLibrary(saved)) {throw new Error('Invalid saved library.');}
                if(generation!==this.generation) {return false;}
                this.revision=saved.revision;this.confirmed=saved;
                if(this.library()===draft) {this.library.set(saved);}
                try {this.window?.localStorage.setItem(this.key(),JSON.stringify(saved));} catch {/* Server save succeeded. */}
                return true;
            } catch(error) {
                if(generation===this.generation) {this.library.set(this.confirmed);this.error.set(error instanceof Error?error.message:'Could not save your library.');this.generation++;this.pending=0;this.saving.set(false);}
                return false;
            } finally {if(generation===this.generation) {this.pending--;this.saving.set(this.pending>0);}}
        });
        this.queue=result.then(()=>{return;});return result;
    }
    change(change:(draft:UserGameLibrary)=>void):void {this.update(change).catch(()=>this.error.set('Could not save library preferences.'));}
    private game(draft:UserGameLibrary,id:string) {
        let game=draft.games.find(game=>game.gameId===id);
        if(!game) {game={gameId:id,isFavorite:false,isPinned:false};draft.games.push(game);}return game;
    }
    toggleFavorite(id:string):void {if(validGameId(id)) {this.change(draft=>{const game=this.game(draft,id);game.isFavorite=!game.isFavorite;});}}
    togglePin(id:string):void {if(validGameId(id)) {this.change(draft=>{const game=this.game(draft,id);game.isPinned=!game.isPinned;draft.pinnedOrder=game.isPinned?[...draft.pinnedOrder,id]:draft.pinnedOrder.filter(value=>value!==id);});}}
    remember(id:string,feature='dashboard'):void {
        if(!validGameId(id) || this.library().games.find(game=>game.gameId===id)?.lastVisitedFeatureId===feature && this.recentGameIds()[0]===id) {return;}
        this.change(draft=>{const game=this.game(draft,id);const latest=Math.max(0,...draft.games.map(item=>Date.parse(item.lastAccessedAt??'')||0));game.lastAccessedAt=new Date(Math.max(Date.now(),latest+1)).toISOString();game.lastVisitedFeatureId=feature;});
    }
    reorderPins(ids:string[]):void {this.change(draft=>{draft.pinnedOrder=ids;});}
    saveCollections(collections:UserGameCollection[]):Promise<boolean> {return this.update(draft=>{draft.collections=collections;});}
    addCollection():UserGameCollection {const now=new Date().toISOString();return {id:'collection-'+crypto.randomUUID(),label:'New Collection',icon:'▦',gameIds:[],createdAt:now,updatedAt:now};}
    setMembership(collectionId:string,gameId:string,checked:boolean):void {this.change(draft=>{const item=draft.collections.find(item=>item.id===collectionId);if(item) {item.gameIds=checked?[...new Set([...item.gameIds,gameId])]:item.gameIds.filter(id=>id!==gameId);item.updatedAt=new Date().toISOString();}});}
    importBrowserFavorites(knownIds:string[]):void {
        try {const old=JSON.parse(this.window?.localStorage.getItem('gg-game-navigation-v1')??'null') as {favorites?:string[]}|null;
            this.change(draft=>{for(const id of old?.favorites??[]) {if(knownIds.includes(id)) {this.game(draft,id).isFavorite=true;}}});
        }catch{this.error.set('Could not read browser favorites.');}
    }
}
