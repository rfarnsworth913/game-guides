import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { GameNavigationPreferences } from '../../../../core/state/game-navigation-preferences';
import { GameNavigation } from '../../../../core/state/game-navigation';
import { GAME_FEATURES, canAccessGame, canAccessFeature } from '@common/workspace/game-overview';
import type { GameRegistration } from '@lib/types';
import type { GameManagementRequest } from '../game-manager/game-manager';
export type SidebarLink={id:string;label:string;icon:string;divider?:boolean};
@Component({selector:'gg-workspace-sidebar',imports:[RouterLink,RouterLinkActive],templateUrl:'./workspace-sidebar.html',styleUrl:'./workspace-sidebar.scss'})
export class WorkspaceSidebar {
 readonly navigation=inject(GameNavigation);
 readonly preferences=inject(GameNavigationPreferences);
 readonly activeGameId=input<string|null>(null);
 readonly catalog=input<GameRegistration[]>([]);
 readonly links=input<readonly SidebarLink[]>([]);
 readonly planCount=input(0);
 readonly canManage=input(false);
 readonly manageGame=output<GameManagementRequest>();
 readonly navigated=output<void>();
 readonly openNavigation=output<void>();
 readonly activeGame=computed(()=>this.catalog().find(game=>game.gameId===this.activeGameId()));
 readonly accessible=computed(()=>this.catalog().filter(game=>canAccessGame(game,this.canManage())));
 readonly workspaceLinks=computed(()=>GAME_FEATURES.filter(feature=>canAccessFeature(this.activeGame(),feature.id,this.canManage())));
 readonly workspaceGroups=computed(()=>{
    const links=this.workspaceLinks();
    const ordered=(ids:string[])=>ids.map(id=>links.find(feature=>feature.id===id)).filter(feature=>!!feature);
    const primary=['events','story'],collection=['characters','teams','inventory','plans'];
    const other=links.filter(feature=>![...primary,...collection,'achievements'].includes(feature.id)).map(feature=>feature.id);
    return [
        {id:'primary',links:ordered(primary)},
        {id:'collection',links:ordered(collection)},
        {id:'other',links:ordered(['achievements',...other])},
    ].filter(group=>group.id==='primary' || group.links.length || group.id==='other' && this.canManage());
 });
 readonly showAllPins=signal(false);
 readonly pinned=computed(()=>this.preferences.pinnedGameIds().map(id=>this.accessible().find(game=>game.gameId===id)).filter(game=>!!game));
 readonly recent=computed(()=>this.preferences.recentGameIds().filter(id=>!this.preferences.pinnedGameIds().includes(id)).map(id=>this.accessible().find(game=>game.gameId===id)).filter(game=>!!game).slice(0,5));
 readonly failedImages=new Set<string>();
 dragging:string|null=null;
 sectionLink(page:string):string {return `/games/${this.activeGameId()}/${page}`;}
 openSelector():void {this.navigation.open();}
 onNavigate():void {this.navigated.emit();}
 switchGame(event:MouseEvent,id:string):void {
    if(event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {return;}
    event.preventDefault();this.navigation.select(id).catch(()=>this.navigation.error.set('Could not switch games.'));this.onNavigate();
 }
 toggle(section:'pinnedGames'|'recentlyUsed'|'collections'):void {this.preferences.change(draft=>{draft.preferences.collapsedSections[section]=!draft.preferences.collapsedSections[section];});}
 drop(id:string):void {
    const ids=[...this.preferences.pinnedGameIds()],from=ids.indexOf(this.dragging??''),to=ids.indexOf(id);
    if(from>=0 && to>=0) {ids.splice(to,0,ids.splice(from,1)[0]);this.preferences.reorderPins(ids);}this.dragging=null;
 }
 move(id:string,direction:number,event:Event):void {event.preventDefault();const ids=[...this.preferences.pinnedGameIds()],index=ids.indexOf(id),target=index+direction;if(target>=0 && target<ids.length) {[ids[index],ids[target]]=[ids[target],ids[index]];this.preferences.reorderPins(ids);}}
}
