import { Component, input } from '@angular/core';
import { Entry } from './workspace.store';
import { PatchOverviewTemplate } from './patch-overview';

@Component({
    selector: 'gg-lore',
    imports: [PatchOverviewTemplate],
    template: '<gg-patch-overview [entry]="entry()" [editing]="editing()" [incompleteOnly]="incompleteOnly()" />',
    styles: ':host { display: block; min-width: 0; }',
})
export class LoreTemplate {
    readonly entry = input.required<Entry>();
    readonly editing = input(false);
    readonly incompleteOnly = input(false);
}
