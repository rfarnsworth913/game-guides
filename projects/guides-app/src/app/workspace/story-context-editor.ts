import { Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StoryContext } from '../../../../common/story-guide';
import { StoryAvailability, StoryRequirementType, StoryTrackingMode } from '../../../../common/enums/story-tracking.enum';

@Component({
    selector: 'gg-story-context-editor',
    imports: [FormsModule],
    templateUrl: './story-context-editor.html',
})
export class StoryContextEditor {
    readonly context = input.required<StoryContext>();
    readonly row = input(false);
    readonly standalone = { standalone: true };
    readonly trackingModes = Object.values(StoryTrackingMode);
    readonly availabilities = Object.values(StoryAvailability);
    readonly requirementTypes = Object.values(StoryRequirementType);
    addRequirement(): void {
        (this.context().requirements ??= []).push({ type: StoryRequirementType.Prerequisite, text: '' });
    }
    relatedIds(value: string): void {
        this.context().relatedContentIds = [...new Set(value.split(',').map(id => id.trim()).filter(Boolean))];
    }
}
