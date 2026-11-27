import { Component, effect, inject, untracked } from '@angular/core';
import { GameNavigation } from '../../../core/state/game-navigation';
import { DialogFocusDirective } from '../../directives/dialog-focus/dialog-focus';
@Component({selector:'gg-game-switcher',imports:[DialogFocusDirective],templateUrl:'./game-switcher.html',styleUrl:'./game-switcher.scss'})
export class GameSwitcher {
 readonly nav=inject(GameNavigation);
 readonly failed=new Set<string>();
 constructor(){effect(()=>{if(this.nav.opened()) {untracked(()=>{if(!this.nav.store.initialized() && !this.nav.store.loading()) {this.nav.store.initialize(true).catch(()=>this.nav.error.set('Could not load games.'));}});}});}
 key(event:KeyboardEvent):void {
    if(event.defaultPrevented) {return;}
    if(!this.nav.opened()) {return;}
    if(event.key==='Enter' && event.target instanceof HTMLElement && event.target.closest('button')) {return;}
    if(['Escape','ArrowDown','ArrowUp','Enter'].includes(event.key)) {event.stopPropagation();}
    if(event.key==='Escape') {event.preventDefault();this.nav.close();}
    if(event.key==='ArrowDown'||event.key==='ArrowUp') {event.preventDefault();const count=this.nav.results().length;this.nav.selected.set(count?(this.nav.selected()+(event.key==='ArrowDown'?1:-1)+count)%count:0);document.getElementById('switch-game-'+this.nav.selected())?.scrollIntoView({block:'nearest'});}
    if(event.key==='Enter') {event.preventDefault();const game=this.nav.results()[this.nav.selected()];if(game) {this.nav.select(game.gameId).catch(()=>this.nav.error.set('Could not switch games.'));}}
 }
}
