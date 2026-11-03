import { StoryAvailability, StoryRequirementType, StoryTrackingMode } from '../../lib/enums/story-tracking.enum';
import type { Entry } from '../../lib/types/workspace.type';
import type { StoryTableRow } from '../../lib/types/story-template.type';
import type { StoryContext } from '../../lib/types/story-context.type';

export function validStoryContext(value: unknown): value is StoryContext | undefined {
    if (value === globalThis.undefined) {return true;}
    if (!value || typeof value !== 'object' || Array.isArray(value)) {return false;}
    const context = value as StoryContext;
    const textFields = ['startDate', 'endDate', 'cycleId', 'resetSchedule', 'chapter', 'region', 'area', 'chain', 'subtype', 'difficulty'] as const;
// eslint-disable-next-line no-control-regex -- Reject ASCII control characters in untrusted identifiers.
    const identifier = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 100 && !/[.$\x00-\x1f]/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
    const validRequirements = (items: unknown): boolean => Array.isArray(items) && items.length <= 100 && items.every((requirement: Record<string, unknown>) =>
        !!requirement && typeof requirement === 'object' && !Array.isArray(requirement) &&
        Object.keys(requirement).every(key => ['type', 'text', 'targetId'].includes(key)) &&
        Object.values(StoryRequirementType).some(type => type === requirement['type']) && typeof requirement['text'] === 'string' && requirement['text'].length <= 4000 &&
        (requirement['targetId'] === globalThis.undefined || identifier(requirement['targetId'])));
    return Object.keys(context).every(key => [...textFields, 'trackingMode', 'availability', 'requirements', 'prerequisites', 'requirementsOperator', 'relatedContentIds'].includes(key)) &&
        textFields.every(key => context[key] === globalThis.undefined || (typeof context[key] === 'string' && context[key]!.length <= 2000)) &&
        (context.trackingMode === globalThis.undefined || Object.values(StoryTrackingMode).includes(context.trackingMode)) &&
        (context.availability === globalThis.undefined || Object.values(StoryAvailability).includes(context.availability)) &&
        [context.startDate, context.endDate].every(date => !date || (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)))) &&
        (!context.startDate || !context.endDate || context.startDate <= context.endDate) &&
        (!context.cycleId || identifier(context.cycleId)) &&
        (context.relatedContentIds === globalThis.undefined || (Array.isArray(context.relatedContentIds) && context.relatedContentIds.length <= 100 && context.relatedContentIds.every(identifier))) &&
        (context.requirements === globalThis.undefined || validRequirements(context.requirements)) &&
        ((context.prerequisites === null || context.prerequisites === globalThis.undefined) || validRequirements(context.prerequisites)) &&
        (context.requirementsOperator === globalThis.undefined || ['allOf', 'anyOf'].includes(context.requirementsOperator));
}

export function storyTemplateFor(entry: Pick<Entry, 'category' | 'patchOverview' | 'mainStory' | 'sideStories' | 'eventStory' | 'worldQuests' | 'lore' | 'characterInformation'>) {
    return entry.category === 'patch-overview' ? entry.patchOverview
        : entry.category === 'main-story' ? entry.mainStory
        : ['events', 'endgame-activity'].includes(entry.category) ? entry.eventStory
        : entry.category === 'side-stories' ? entry.sideStories
        : entry.category === 'character-information' ? entry.characterInformation
        : entry.category === 'lore' ? entry.lore
        : entry.category === 'world-quests' ? entry.worldQuests : globalThis.undefined;
}

export function storyTrackingMode(entry: Entry, row?: StoryTableRow): StoryTrackingMode {
    return row?.context?.trackingMode ?? storyTemplateFor(entry)?.context?.trackingMode ??
        (entry.category === 'patch-overview' || entry.category === 'character-information' ? StoryTrackingMode.Viewed
            : entry.category === 'lore' ? StoryTrackingMode.Read : StoryTrackingMode.Completed);
}

/** Recurring cycles use additional private map keys; old/lifetime keys are never overwritten. */
export function storyCompletionKey(entry: Entry, row: StoryTableRow): string | null {
    if (storyTrackingMode(entry, row) !== StoryTrackingMode.Recurring) {return row.id;}
    const cycle = row.context?.cycleId || storyTemplateFor(entry)?.context?.cycleId;
    if (!cycle) {return null;}
    const key = `cycle:${encodeURIComponent(cycle)}:${encodeURIComponent(row.id)}`;
    return key.length <= 300 ? key : null;
}

export function storyRowDone(entry: Entry, row: StoryTableRow): boolean {
    const key = storyCompletionKey(entry, row);
    return key !== null && entry.storyRowCompletion?.[key] === true;
}

export function trimStoryContext(context?: StoryContext): void {
    if (!context) {return;}
    for (const [key, value] of Object.entries(context)) {if (typeof value === 'string') {(context as Record<string, unknown>)[key] = value.trim();}}
    for (const requirement of [...context.requirements ?? [], ...context.prerequisites ?? []]) {
        requirement['text'] = requirement['text'].trim();
        if (requirement['targetId'] !== globalThis.undefined) {
            requirement['targetId'] = requirement['targetId'].trim();
            if (!requirement['targetId']) {delete requirement['targetId'];}
        }
    }
}
