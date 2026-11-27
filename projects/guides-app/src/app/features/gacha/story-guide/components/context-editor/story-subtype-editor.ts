import { Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { StoryContext } from '@lib/types/story-context.type';
import { WORLD_QUEST_SUBTYPES } from '@lib/constants/world-quest.constants';

@Component({
    selector: 'gg-story-subtype-editor',
    imports: [FormsModule],
    template: `<label>Activity Sub-type<input [attr.list]="worldQuest() ? listId : null" [ngModelOptions]="{ standalone: true }" [(ngModel)]="context().subtype" placeholder="e.g. Hidden Exploration Objective" /></label>
        @if (worldQuest()) { <datalist [id]="listId">@for (subtype of subtypes; track subtype) { <option [value]="subtype"></option> }</datalist> }`,
    styles: ':host { display: block; min-width: 0; } :host label { display: grid; gap: 8px; margin: 0; } :host label input { margin: 0; min-height: 44px; }',
})
export class StorySubtypeEditor {
    readonly context = input.required<StoryContext>();
    readonly worldQuest = input(false);
    readonly listId = 'story-subtypes-' + crypto.randomUUID();
    readonly subtypes = [...WORLD_QUEST_SUBTYPES.keys()];
}
