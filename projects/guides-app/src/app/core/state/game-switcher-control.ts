import { inject, Injectable, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
/** Lightweight root shortcut state keeps catalog code out of the initial bundle. */
@Injectable({providedIn:'root'})
export class GameSwitcherControl {
    readonly opened=signal(false);
    readonly query=signal('');
    readonly selected=signal(0);
    private readonly document=inject(DOCUMENT);
    private previous:HTMLElement|null=null;
    open():void {
        if(this.opened() || this.document.querySelector('.modal-backdrop [role="dialog"]:not([data-game-switcher])')) {return;}
        const focused=this.document.activeElement as HTMLElement|null;
        if(!focused?.closest('gg-game-switcher')) {this.previous=focused;}
        this.query.set('');this.selected.set(0);this.opened.set(true);
    }
    close():void {this.opened.set(false);this.previous?.focus({preventScroll:true});}
}
