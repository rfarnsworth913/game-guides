import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardState } from '../../state/dashboard-state';

@Component({ selector: 'gg-game-collection', imports: [RouterLink], templateUrl: './game-collection.html', styleUrl: './game-collection.scss' })
export class GameCollectionPage extends DashboardState {}
