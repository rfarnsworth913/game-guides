import { Component, input } from '@angular/core';
import { Entry } from './workspace.store';
import { PatchOverviewTemplate } from './patch-overview';

@Component({
    selector: 'gg-world-quests',
    imports: [PatchOverviewTemplate],
    template: '<gg-patch-overview [entry]="entry()" [editing]="editing()" />',
    styles: ':host { display: block; min-width: 0; }',
})
export class WorldQuestsTemplate {
    readonly entry = input.required<Entry>();
    readonly editing = input(false);
}
