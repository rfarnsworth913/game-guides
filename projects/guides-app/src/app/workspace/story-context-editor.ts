import { Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StoryContext } from '../../../../common/story-guide';
import { StoryAvailability, StoryRequirementType, StoryTrackingMode } from '../../../../common/enums/story-tracking.enum';
import { worldQuestPrerequisites } from '../../../../common/world-quest';
import { WORLD_QUEST_SUBTYPES } from '../../../../common/constants/world-quest.constants';

@Component({
    selector: 'gg-story-context-editor',
    imports: [FormsModule],
    templateUrl: './story-context-editor.html',
})
export class StoryContextEditor {
    readonly context = input.required<StoryContext>();
    readonly row = input(false);
    readonly worldQuest = input(false);
    readonly standalone = { standalone: true };
    readonly trackingModes = Object.values(StoryTrackingMode);
    readonly availabilities = Object.values(StoryAvailability);
    readonly requirementTypes = Object.values(StoryRequirementType);
    readonly gateTypes = [StoryRequirementType.Prerequisite, StoryRequirementType.Unlock, StoryRequirementType.TimeGate, StoryRequirementType.Location];
    readonly subtypeListId = 'world-subtypes-' + crypto.randomUUID();
    readonly worldSubtypes = [...WORLD_QUEST_SUBTYPES.keys()];
    readonly prerequisites = () => worldQuestPrerequisites(this.context());
    requirementStatus(): string {
        const gates = this.prerequisites();
        return gates === null ? 'unknown' : gates.length ? 'documented' : 'none';
    }
    setRequirementStatus(status: string): void {
        this.context().prerequisites = status === 'unknown' ? null : status === 'none' ? []
            : structuredClone(this.prerequisites()?.length ? this.prerequisites()! : [{ type: StoryRequirementType.Prerequisite, text: '' }]);
    }
    addPrerequisite(): void {
        this.context().prerequisites = [...structuredClone(this.prerequisites() ?? []), { type: StoryRequirementType.Prerequisite, text: '' }];
    }
    removePrerequisite(index: number): void {
        const remaining = (this.prerequisites() ?? []).filter((_, position) => position !== index);
        this.context().prerequisites = remaining.length ? remaining : null;
    }
    setPrerequisite(index: number, field: 'text' | 'type' | 'targetId', value: string): void {
        const gates = structuredClone(this.prerequisites() ?? []);
        if (field === 'type') {
            gates[index].type = value as StoryRequirementType;
        } else {
            gates[index][field] = value;
        }
        this.context().prerequisites = gates;
    }
    addRequirement(): void {
        (this.context().requirements ??= []).push({ type: StoryRequirementType.Prerequisite, text: '' });
    }
    relatedIds(value: string): void {
        this.context().relatedContentIds = [...new Set(value.split(',').map(id => id.trim()).filter(Boolean))];
    }
}
