import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { WorkspaceStore } from './workspace.store';
import { GameNavigationPreferences } from './game-navigation-preferences';
import { gameDestination, searchGames } from '@common/workspace/game-library';
import { canAccessGame, canAccessFeature } from '@common/workspace/game-overview';
import { GameSwitcherControl } from './game-switcher-control';
@Injectable({providedIn:'root'})
export class GameNavigation {
    readonly store=inject(WorkspaceStore);
    readonly preferences=inject(GameNavigationPreferences);
    private readonly router=inject(Router);
    private readonly control=inject(GameSwitcherControl);
    readonly opened=this.control.opened;
    readonly query=this.control.query;
    readonly selected=this.control.selected;
    readonly switching=signal(false);
    readonly error=signal('');
    readonly currentUrl=signal(this.router.url);
    readonly results=computed(()=>{
        const library=this.preferences.library();
        const games=searchGames(this.store.games(),this.query(),library,this.store.canEdit());
        if(this.query().trim()) {return games.slice(0,30);}
        const order=[...new Set([...this.preferences.recentGameIds(),...library.pinnedOrder])];
        return [...order.map(id=>games.find(game=>game.gameId===id)).filter(game=>!!game),...games.filter(game=>!order.includes(game.gameId))].slice(0,20);
    });
    constructor() {
        this.router.events.subscribe(event=>{if(event instanceof NavigationEnd) {this.currentUrl.set(event.urlAfterRedirects);}});
        effect(()=>{
            const match=/^\/games\/([^/]+)\/([^/?#]+)/.exec(this.currentUrl());
            const ready=!this.preferences.loading();
            if(match && ready && this.store.games().some(game=>game.gameId===match[1] && canAccessFeature(game,match[2],this.store.canEdit()))) {this.preferences.remember(match[1],match[2]);}
        });
    }
    open():void {
        this.query.set('');this.selected.set(0);this.error.set('');this.control.open();
        if(!this.store.initialized() && !this.store.loading()) {this.store.initialize(true).catch(()=>this.error.set('Could not load games.'));}
    }
    close():void {this.control.close();}
    async select(id:string):Promise<void> {
        const game=this.store.games().find(game=>game.gameId===id);
        if(!game || !canAccessGame(game,this.store.canEdit()) || this.switching()) {return;}
        this.switching.set(true);this.error.set('');
        try {
            const match=/^\/games\/([^/]+)\/([^/?#]+)/.exec(this.router.url);
            if(match?.[1]===id) {this.close();return;}
            if(await this.router.navigateByUrl(gameDestination(game,match?.[2],this.preferences.library(),this.store.canEdit()))) {this.close();}
            else {this.error.set('Navigation was cancelled. Your current page is unchanged.');}
        }catch {this.error.set('Could not open this game. Please try again.');}
        finally {this.switching.set(false);}
    }
}
