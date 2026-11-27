import { Component, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import type { StoryContext } from "@lib/types/story-context.type";
import { StoryAvailability, StoryRequirementType } from "@lib/enums/story-tracking.enum";
import { worldQuestPrerequisites } from "@common/quests/world-quest";
import { StorySubtypeEditor } from './story-subtype-editor';

import { RequirementPicker } from './requirement-picker';
import type { Entry } from '../../../../../core/state/workspace.store';

@Component({
    selector: 'gg-story-context-editor',
    imports: [FormsModule, NgTemplateOutlet, RequirementPicker, StorySubtypeEditor],
    templateUrl: "./story-context-editor.html",
    styleUrls: ["./story-context-editor.scss", "./story-context-panels.scss"],
})
export class StoryContextEditor {
    readonly context = input.required<StoryContext>();
    readonly row = input(false);
    readonly inline = input(false);
    readonly showSubtype = input(true);
    readonly showAvailabilityFields = input(true);
    readonly showRequirements = input(true);
    readonly panels = input(false);
    readonly requirementsExpanded = signal(false);
    readonly relatedExpanded = signal(false);
    readonly panelId = 'context-panels-' + crypto.randomUUID();
    readonly toggleExpanded = (value: boolean) => !value;
    requirementCount(): number {return (this.context().prerequisites?.length ?? 0) + (this.context().requirements?.length ?? 0);}
    readonly worldQuest = input(false);
    readonly standalone = { standalone: true };
    readonly game = input('');
    readonly entries = input<Entry[]>([]);
    readonly availabilities = Object.values(StoryAvailability);
    readonly requirementTypes = Object.values(StoryRequirementType);
    readonly gateTypes = [StoryRequirementType.Prerequisite, StoryRequirementType.Unlock, StoryRequirementType.TimeGate, StoryRequirementType.Location];
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
