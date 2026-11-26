import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { GameRegistration } from '@lib/types';
import { GAME_FEATURES, canAccessFeature } from '@common/workspace/game-overview';
import { GameNavigationPreferences } from '../../../../core/state/game-navigation-preferences';
@Component({selector:'gg-game-card',imports:[RouterLink],templateUrl:'./game-card.html',styleUrl:'./game-card.scss'})
export class GameCard {
 readonly game=input.required<GameRegistration>();readonly mode=input<'grid'|'list'>('grid');readonly editor=input(false);readonly menu=output<MouseEvent>();
 readonly preferences=inject(GameNavigationPreferences);readonly failed=signal<string[]>([]);
 readonly features=computed(()=>GAME_FEATURES.filter(feature=>canAccessFeature(this.game(),feature.id,this.editor())));
 fail(url:string):void {this.failed.update(images=>[...images,url]);}
}
