import { Component, computed, effect, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { WorkspaceStore } from '../../../../core/state/workspace.store';
import { GameNavigationPreferences } from '../../../../core/state/game-navigation-preferences';
import { GameNavigation } from '../../../../core/state/game-navigation';
import { canAccessGame } from '@common/workspace/game-overview';
import { searchGames } from '@common/workspace/game-library';
import type { GameRegistration, GameLibrarySort, UserGameCollection } from '@lib/types';
import { GameCard } from '../components/game-card';
import { GameManager, type GameManagementRequest } from '../../../../layouts/main-layout/components/game-manager/game-manager';
import { GameImagePicker } from '../../../../shared/components/image-selector/game-image-picker';
import { DialogFocusDirective } from '../../../../shared/directives/dialog-focus/dialog-focus';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
@Component({selector:'gg-game-library',imports:[FormsModule,RouterLink,GameCard,GameManager,GameImagePicker,DialogFocusDirective],templateUrl:'./game-library.html',styleUrl:'./game-library.scss'})
export class GameLibraryPage {
 readonly store=inject(WorkspaceStore);readonly preferences=inject(GameNavigationPreferences);readonly navigation=inject(GameNavigation);private readonly router=inject(Router);
 readonly url=signal(this.router.url);readonly search=signal('');readonly type=signal('');
 readonly mode=computed(()=>this.preferences.library().preferences.viewMode);
 readonly sort=computed(()=>{const value=this.preferences.library().preferences.sortBy;return value==='custom' && !['collections','pinned'].includes(this.view())?'name-asc':value;});
 readonly accessible=computed(()=>this.store.games().filter(game=>canAccessGame(game,this.store.canEdit())));
 readonly types=computed(()=>[...new Set(this.accessible().flatMap(game=>game.genres))].sort((a,b)=>a.localeCompare(b)));
 readonly view=computed(()=>this.url().split('?')[0].split('/')[2]??'all');
 readonly collection=computed(()=>this.preferences.library().collections.find(item=>item.id===this.url().split('?')[0].split('/')[3]));
 readonly title=computed(()=>this.view()==='collections'?this.collection()?.label??'Collection not found':({favorites:'Favorites',pinned:'Pinned Games',recent:'Recently Used',manage:'Manage Games'}[this.view()]??'Game Library'));
 readonly visible=computed(()=>{
    let games=searchGames(this.accessible(),this.search(),this.preferences.library(),this.store.canEdit());
    const view=this.view(),library=this.preferences.library();
    if(view==='favorites') {games=games.filter(game=>this.preferences.favoriteGameIds().includes(game.gameId));}
    if(view==='pinned') {games=games.filter(game=>library.pinnedOrder.includes(game.gameId));}
    if(view==='recent') {games=games.filter(game=>this.preferences.recentGameIds().includes(game.gameId));}
    if(view==='collections') {games=games.filter(game=>this.collection()?.gameIds.includes(game.gameId));}
    if(this.type()) {games=games.filter(game=>game.genres.includes(this.type()));}
    const recent=(id:string)=>library.games.find(game=>game.gameId===id)?.lastAccessedAt??'';
    return games.sort((a,b)=>{
        const sort=view==='recent'?'recently-used':this.sort();
        if(sort==='recently-used') {return recent(b.gameId).localeCompare(recent(a.gameId))||a.name.localeCompare(b.name);}
        if(sort==='recently-added') {return (b.createdAt??'').localeCompare(a.createdAt??'')||a.name.localeCompare(b.name);}
        if(sort==='game-type') {return [...a.genres].sort().join(', ').localeCompare([...b.genres].sort().join(', '))||a.name.localeCompare(b.name);}
        if(sort==='custom') {const ids=view==='collections'?this.collection()?.gameIds??[]:library.pinnedOrder;return ids.indexOf(a.gameId)-ids.indexOf(b.gameId);}
        return (sort==='name-desc'?-1:1)*a.name.localeCompare(b.name);
    });
 });
 readonly shown=signal(48);readonly menu=signal<{game:GameRegistration;x:number;y:number}|null>(null);
 readonly membership=signal<GameRegistration|null>(null);readonly editing=signal<UserGameCollection[]|null>(null);readonly collectionError=signal('');
 readonly confirmation=signal<{message:string;game?:GameRegistration}|null>(null);
 management:GameManagementRequest|null=null;draggingCollection:number|null=null;draggingGame:string|null=null;
 private organizeHandled=false;
 importFavorites():void {this.preferences.importBrowserFavorites(this.accessible().map(game=>game.gameId));}
 showMore():void {this.shown.update(value=>value+48);}
 constructor(){
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event=>{if(event instanceof NavigationEnd) {this.url.set(event.urlAfterRedirects);this.search.set('');this.type.set('');this.shown.set(48);}});
    effect(()=>{const organize=this.url().includes('organize=true');if(!organize) {this.organizeHandled=false;}if(organize && !this.preferences.loading() && !this.organizeHandled) {this.organizeHandled=true;this.editing.set(structuredClone(this.preferences.library().collections));}});
 }
 preference(field:'viewMode'|'sortBy',value:string):void {this.preferences.change(draft=>{if(field==='viewMode') {draft.preferences.viewMode=value as 'grid'|'list';}else{draft.preferences.sortBy=value as GameLibrarySort;}});}
 openMenu(game:GameRegistration,event:MouseEvent):void {event.stopPropagation();this.menu.set({game,x:Math.max(8,Math.min(event.clientX,window.innerWidth-230)),y:Math.max(8,Math.min(event.clientY,window.innerHeight-310))});}
 @HostListener('document:click') outside():void {this.menu.set(null);}
 @HostListener('document:keydown.escape') escape():void {if(this.confirmation()) {this.confirmation.set(null);return;}if(this.editing()) {this.closeCollections();}this.membership.set(null);this.menu.set(null);}
 edit(game:GameRegistration):void {if(this.store.canEdit()) {this.management={action:'edit',id:game.gameId};}this.menu.set(null);}
 toggleFavorite(game:GameRegistration):void {this.preferences.toggleFavorite(game.gameId);this.menu.set(null);}
 togglePin(game:GameRegistration):void {this.preferences.togglePin(game.gameId);this.menu.set(null);}
 restrict(game:GameRegistration):void {if(this.store.canEdit()) {this.confirmation.set({message:`Restrict ${game.name} to editors? All game content and progress will be preserved.`,game});}this.menu.set(null);}
 beginCollections():void {this.editing.set(structuredClone(this.preferences.library().collections));this.collectionError.set('');}
 closeCollections():void {const editing=this.editing();if(editing && JSON.stringify(editing)!==JSON.stringify(this.preferences.library().collections)) {this.confirmation.set({message:'Discard collection changes?'});return;}this.finishCloseCollections();}
 private finishCloseCollections():void {this.editing.set(null);if(this.url().includes('organize=true')) {this.router.navigateByUrl('/library').catch(()=>this.collectionError.set('Could not open library.'));}}
 async confirmAction():Promise<void> {const action=this.confirmation();this.confirmation.set(null);if(action?.game) {try{await this.store.saveGameOverview({...action.game,visibility:'editors'});}catch(error){this.collectionError.set(error instanceof Error?error.message:'Could not update game.');}}else{this.finishCloseCollections();}}
 addCollection():void {this.editing.update(items=>[...items??[],this.preferences.addCollection()]);}
 removeCollection(index:number):void {this.editing.update(items=>items?.filter((_,i)=>i!==index)??[]);}
 moveCollection(index:number,direction:number,event?:Event):void {event?.preventDefault();const items=[...this.editing()??[]],target=index+direction;if(target<0||target>=items.length){return;}[items[index],items[target]]=[items[target],items[index]];this.editing.set(items);}
 dropCollection(index:number):void {const items=[...this.editing()??[]];if(this.draggingCollection!==null) {items.splice(index,0,items.splice(this.draggingCollection,1)[0]);this.editing.set(items);}this.draggingCollection=null;}
 async saveCollections():Promise<void> {const items=structuredClone(this.editing()??[]).map(item=>({...item,label:item.label.trim(),updatedAt:new Date().toISOString()}));if(items.some(item=>!item.label||item.label.length>80)) {this.collectionError.set('Enter a name of 1–80 characters for every collection.');return;}if(await this.preferences.saveCollections(items)) {this.editing.set(null);if(this.url().includes('organize=true')) {this.router.navigateByUrl('/library').catch(()=>this.collectionError.set('Could not open library.'));}}}
 dropGame(id:string):void {const collection=this.collection();if(!collection || this.sort()!=='custom' || !this.draggingGame) {return;}const ids=[...collection.gameIds],from=ids.indexOf(this.draggingGame),to=ids.indexOf(id);if(from>=0&&to>=0) {ids.splice(to,0,ids.splice(from,1)[0]);this.preferences.change(draft=>{draft.collections.find(item=>item.id===collection.id)!.gameIds=ids;});}this.draggingGame=null;}
}
