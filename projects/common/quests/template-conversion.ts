import type { Entry } from '@lib/types/workspace.type';
import type { PatchOverview } from '@lib/types/story-template.type';
import type { StoryContentType } from '@lib/types/story-content.type';
import { STORY_CONTENT_TYPES } from '@lib/constants/story-content.constants';
import { emptyPatchOverview } from './story-template';
import { storyTemplateFor } from './story-guide';

export const templateFields = {
    'patch-overview': 'patchOverview', 'main-story': 'mainStory', 'side-stories': 'sideStories',
    events: 'eventStory', 'endgame-activity': 'eventStory', 'world-quests': 'worldQuests',
    lore: 'lore', 'character-information': 'characterInformation',
} as const;

/** Presentation capabilities; shared rows/resources are supported by every non-decorative template. */
export const templateRegistry = STORY_CONTENT_TYPES.map(template => ({ ...template,
    groups: template.id !== 'divider', supportingImage: ['character-information', 'endgame-activity'].includes(template.id),
    characterAttributes: template.id === 'character-information', availability: template.id === 'events',
    requiredFields: template.id === 'divider' ? [] : ['name'],
}));

function meaningful(value: unknown): boolean {
    if (Array.isArray(value)) {return value.length > 0;}
    if (value && typeof value === 'object') {return Object.values(value).some(meaningful);}
    return typeof value === 'string' ? !!value.trim() : value !== globalThis.undefined && value !== null && value !== false;
}

export function preservedTemplateFields(entry: Entry): (keyof PatchOverview)[] {
    const data = entry.storyContent ?? storyTemplateFor(entry);
    if (!data) {return [];}
    if (entry.category === 'divider') {return (Object.keys(data) as (keyof PatchOverview)[]).filter(key => meaningful(data[key]));}
    const keys: (keyof PatchOverview)[] = entry.category === 'character-information' ? [] : ['characterName', 'damageType', 'damageTypeIcon', 'faction', 'factionIcon'];
    if (entry.category !== 'patch-overview') {keys.push('versionImageUrl', 'patchTitle', 'releaseDate');}
    if (entry.category === 'endgame-activity') {
        if (data.context && [data.context.availability, data.context.startDate, data.context.endDate, data.context.trackingMode, data.context.cycleId, data.context.resetSchedule].some(meaningful)) {keys.push('context');}
    } else if (entry.category !== 'events' && data.context && meaningful(data.context)) {keys.push('context');}
    return keys.filter(key => data[key] !== globalThis.undefined && data[key] !== '');
}

/** Deterministic draft-only conversion. No IDs, progress, dates, references or scheduling are regenerated. */
export function convertStoryTemplate(source: Entry, target: string) {
    const definition = templateRegistry.find(template => template.id === target);
    if (!definition) {throw new Error('Choose a supported content template.');}
    const entry = structuredClone(source);
    const data = structuredClone(source.storyContent ?? storyTemplateFor(source) ?? emptyPatchOverview());
    if (source.category !== 'divider' && source.name) {data.title = source.name;}
    if (source.category === 'divider' && data.title) {entry.name = data.title;}
    const sourceField = templateFields[source.category as keyof typeof templateFields];
    // The neutral profile holds all shared and unsupported fields once. Other pre-existing
    // legacy drafts remain inspectable rather than being overwritten by a conversion.
    for (const field of new Set(Object.values(templateFields))) {
        const previous = entry[field];
        if (previous && (field !== sourceField || (source.storyContent && JSON.stringify(previous) !== JSON.stringify(source.storyContent)))) {
            const { preservedTemplates, ...content } = structuredClone(previous);
            data.preservedTemplates = [...data.preservedTemplates ?? [], ...preservedTemplates ?? [], { template: field, content }];
        }
        Reflect.deleteProperty(entry, field);
    }
    entry.storyContent = data;
    entry.category = target;
    const preserved = preservedTemplateFields(entry);
    const warnings = [
        ...(preserved.length ? [`${preserved.length} template-specific fields are retained in Preserved Content.`] : []),
        ...(data.preservedTemplates?.length ? [`${data.preservedTemplates.length} previous template drafts are retained in Preserved Content.`] : []),
        ...(target === 'divider' && preserved.length ? ['Divider hides all content and progress. Both are retained; switch back to restore them.'] : []),
        ...(source.category === 'divider' && !entry.name.trim() ? ['Enter a section title before saving.'] : []),
        ...(data.imageUrl && ['character-information', 'endgame-activity'].includes(source.category) && !definition.supportingImage ? ['The original artwork is retained without resizing. Check how it fits the destination header.'] : []),
    ];
    return { entry, sourceTemplate: source.category, targetTemplate: target as StoryContentType,
        mappedFields: ['Title', 'Images and attribution', 'Groups and objective IDs', 'Requirements, notes and resources', 'Patch, availability and cycle information', 'Completion and calendar references'],
        preservedFields: preserved, warnings, requiredFields: definition.requiredFields.filter(key => !entry[key as 'name'].trim()),
        requiresConfirmation: warnings.length > 0 };
}
