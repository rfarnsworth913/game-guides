import { StoryAvailability, StoryRequirementType, StoryTrackingMode } from './enums/story-tracking.enum';
import type { Entry } from './workspace';
import type { StoryTableRow } from './story-template';

/** Optional additions to the existing records. Legacy IDs and completion keys stay unchanged. */
export type StoryContext = {
    trackingMode?: StoryTrackingMode;
    availability?: StoryAvailability;
    startDate?: string;
    endDate?: string;
    cycleId?: string;
    resetSchedule?: string;
    chapter?: string;
    region?: string;
    area?: string;
    chain?: string;
    subtype?: string;
    difficulty?: string;
    requirements?: { type: StoryRequirementType; text: string; targetId?: string }[];
    /** Undefined/null means undocumented; an explicit empty list means no prerequisites. */
    prerequisites?: { type: StoryRequirementType; text: string; targetId?: string }[] | null;
    requirementsOperator?: 'allOf' | 'anyOf';
    relatedContentIds?: string[];
};

export function validStoryContext(value: unknown): value is StoryContext | undefined {
    if (value === undefined) return true;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const context = value as StoryContext;
    const textFields = ['startDate', 'endDate', 'cycleId', 'resetSchedule', 'chapter', 'region', 'area', 'chain', 'subtype', 'difficulty'] as const;
    const identifier = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 100 && !/[.$\x00-\x1f]/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
    const validRequirements = (items: unknown): boolean => Array.isArray(items) && items.length <= 100 && items.every(requirement =>
        !!requirement && typeof requirement === 'object' && !Array.isArray(requirement) &&
        Object.keys(requirement).every(key => ['type', 'text', 'targetId'].includes(key)) &&
        Object.values(StoryRequirementType).includes(requirement.type) && typeof requirement.text === 'string' && requirement.text.length <= 4000 &&
        (requirement.targetId === undefined || identifier(requirement.targetId)));
    return Object.keys(context).every(key => [...textFields, 'trackingMode', 'availability', 'requirements', 'prerequisites', 'requirementsOperator', 'relatedContentIds'].includes(key)) &&
        textFields.every(key => context[key] === undefined || (typeof context[key] === 'string' && context[key]!.length <= 2000)) &&
        (context.trackingMode === undefined || Object.values(StoryTrackingMode).includes(context.trackingMode)) &&
        (context.availability === undefined || Object.values(StoryAvailability).includes(context.availability)) &&
        [context.startDate, context.endDate].every(date => !date || (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)))) &&
        (!context.startDate || !context.endDate || context.startDate <= context.endDate) &&
        (!context.cycleId || identifier(context.cycleId)) &&
        (context.relatedContentIds === undefined || (Array.isArray(context.relatedContentIds) && context.relatedContentIds.length <= 100 && context.relatedContentIds.every(identifier))) &&
        (context.requirements === undefined || validRequirements(context.requirements)) &&
        (context.prerequisites == null || validRequirements(context.prerequisites)) &&
        (context.requirementsOperator === undefined || ['allOf', 'anyOf'].includes(context.requirementsOperator));
}

export function storyTemplateFor(entry: Pick<Entry, 'category' | 'patchOverview' | 'mainStory' | 'sideStories' | 'eventStory' | 'worldQuests' | 'lore' | 'characterInformation'>) {
    return entry.category === 'patch-overview' ? entry.patchOverview
        : entry.category === 'main-story' ? entry.mainStory
        : ['events', 'endgame-activity'].includes(entry.category) ? entry.eventStory
        : entry.category === 'side-stories' ? entry.sideStories
        : entry.category === 'character-information' ? entry.characterInformation
        : entry.category === 'lore' ? entry.lore
        : entry.category === 'world-quests' ? entry.worldQuests : undefined;
}

export function storyTrackingMode(entry: Entry, row?: StoryTableRow): StoryTrackingMode {
    return row?.context?.trackingMode ?? storyTemplateFor(entry)?.context?.trackingMode ??
        (entry.category === 'patch-overview' || entry.category === 'character-information' ? StoryTrackingMode.Viewed
            : entry.category === 'lore' ? StoryTrackingMode.Read : StoryTrackingMode.Completed);
}

/** Recurring cycles use additional private map keys; old/lifetime keys are never overwritten. */
export function storyCompletionKey(entry: Entry, row: StoryTableRow): string | null {
    if (storyTrackingMode(entry, row) !== StoryTrackingMode.Recurring) return row.id;
    const cycle = row.context?.cycleId || storyTemplateFor(entry)?.context?.cycleId;
    if (!cycle) return null;
    const key = `cycle:${encodeURIComponent(cycle)}:${encodeURIComponent(row.id)}`;
    return key.length <= 300 ? key : null;
}

export function storyRowDone(entry: Entry, row: StoryTableRow): boolean {
    const key = storyCompletionKey(entry, row);
    return key !== null && entry.storyRowCompletion?.[key] === true;
}

export function trimStoryContext(context?: StoryContext): void {
    if (!context) return;
    for (const [key, value] of Object.entries(context)) if (typeof value === 'string') (context as Record<string, unknown>)[key] = value.trim();
    for (const requirement of [...context.requirements ?? [], ...context.prerequisites ?? []]) {
        requirement.text = requirement.text.trim();
        if (requirement.targetId !== undefined) {
            requirement.targetId = requirement.targetId.trim();
            if (!requirement.targetId) delete requirement.targetId;
        }
    }
}
