import type { CatalogEntry } from '../../lib/types/workspace.type';
import type { PatchOverview } from '../../lib/types/story-template.type';
import { StoryAvailability } from '../../lib/enums/story-tracking.enum';
import { emptyPatchOverview } from '../quests/story-template';

export const eventNameKey = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

/** Return a detached editor/reading view of the single shared event definition. */
export function eventStoryProfile(event: CatalogEntry): PatchOverview {
    const profile = structuredClone(event.eventStory ?? emptyPatchOverview());
    profile.summary = event.notes || profile.summary;
    profile.context = { ...profile.context,
        ...(event.startDate ? { startDate: event.startDate } : {}),
        ...(event.endDate ? { endDate: event.endDate } : {}) };
    profile.context.availability ??= event.eventType === 'permanent' ? StoryAvailability.Permanent
        : ['daily', 'weekly', 'weekly-linked', 'monthly', 'end-game'].includes(event.eventType ?? '') ? StoryAvailability.Recurring
        : event.eventType ? StoryAvailability.Limited : globalThis.undefined;
    return profile;
}

export function resolveEventReferences<T extends CatalogEntry>(entries: T[]): T[] {
    return entries.map(entry => {
        if (entry.kind !== 'story' || entry.category !== 'events' || !entry.eventId) {return entry;}
        const event = entries.find(item => item.kind === 'events' && item.game === entry.game && item.id === entry.eventId);
        return event ? { ...entry, name: event.name, eventStory: eventStoryProfile(event) } : entry;
    });
}

export function editEventStory<T extends CatalogEntry>(event: T, draft: PatchOverview, name = event.name): T {
    const profile = structuredClone(draft);
    const notes = profile.summary ?? event.notes;
    delete profile.summary;
    const startDate = profile.context?.startDate ?? event.startDate;
    const endDate = profile.context?.endDate ?? event.endDate;
    // Dates live on the event; reference projections supply them to template views.
    if (profile.context) {delete profile.context.startDate; delete profile.context.endDate;}
    return { ...event, name: name.trim() || event.name, notes, eventStory: profile,
        ...(startDate !== globalThis.undefined ? { startDate } : {}),
        ...(endDate !== globalThis.undefined ? { endDate } : {}) };
}

/** Reject conflicting content instead of guessing or silently discarding an editor's work. */
function mergeProfiles(left: PatchOverview, right: PatchOverview, name: string): PatchOverview {
    const result = structuredClone(left);
    for (const [key, value] of Object.entries(right)) {
        if (key === 'rows' || key === 'groups' || value === '' || value === globalThis.undefined) {continue;}
        const previous = Reflect.get(result, key) as unknown;
        if (previous !== '' && previous !== globalThis.undefined && JSON.stringify(previous) !== JSON.stringify(value)) {
            throw new Error(`Event ${name}: conflicting ${key}; resolve the records before linking.`);
        }
        Reflect.set(result, key, structuredClone(value));
    }
    for (const field of ['rows', 'groups'] as const) {
        const merged = [...result[field] ?? []];
        for (const item of right[field] ?? []) {
            const previous = merged.find(old => old.id === item.id);
            if (previous && JSON.stringify(previous) !== JSON.stringify(item)) {throw new Error(`Event ${name}: conflicting ${field} ID ${item.id}.`);}
            if (!previous) {merged.push(structuredClone(item));}
        }
        if (field === 'rows') {result.rows = merged as PatchOverview['rows'];}
        else if (merged.length) {result.groups = merged as PatchOverview['groups'];}
    }
    return result;
}

/** Preserve placement IDs and row IDs so existing player progress remains valid. */
export function migrateStoryEvents(entries: CatalogEntry[], makeId: (game: string, name: string) => string = () => crypto.randomUUID()) {
    const result = structuredClone(entries);
    let created = 0, linked = 0;
    for (const story of result.filter(entry => entry.kind === 'story' && entry.category === 'events' && !entry.eventId)) {
        const profile = structuredClone(story.eventStory ?? emptyPatchOverview());
        const name = story.name.trim();
        if (!name) {throw new Error('An event story has no title.');}
        const matches = result.filter(entry => entry.kind === 'events' && entry.game === story.game && eventNameKey(entry.name) === eventNameKey(name));
        if (matches.length > 1) {throw new Error(`Event ${name}: multiple event periods match; select a specific event before migrating.`);}
        let event = matches[0];
        if (!event) {
            const id = makeId(story.game, name);
            if (result.some(entry => entry.id === id)) {throw new Error(`Event ID collision for ${name}.`);}
            event = { id, game: story.game, kind: 'events', name, notes: '', category: '', rarity: 1, members: [], requirements: [], day: '',
                order: result.filter(entry => entry.kind === 'events' && entry.game === story.game).length,
                eventType: profile.context?.availability === StoryAvailability.Permanent ? 'permanent' : 'temporary' };
            result.push(event); created++;
        }
        // Keep parser dates verbatim (including their time zones), and refuse incompatible periods.
        for (const field of ['startDate', 'endDate'] as const) {
            const value = profile.context?.[field];
            if (value && event[field] && value.slice(0, 10) !== event[field]!.slice(0, 10)) {throw new Error(`Event ${name}: conflicting ${field}; select the correct event period.`);}
            if (event[field] && profile.context) {Reflect.deleteProperty(profile.context, field);}
        }
        const summary = profile.summary;
        delete profile.summary;
        const combined = event.eventStory ? mergeProfiles(event.eventStory, profile, name) : profile;
        const updated = editEventStory(event, combined, name);
        if (summary?.trim() && !updated.notes.includes(summary.trim())) {updated.notes = [updated.notes, summary.trim()].filter(Boolean).join('\n\n');}
        Object.assign(event, updated);
        story.eventId = event.id;
        delete story.eventStory;
        linked++;
    }
    for (const placement of result.filter(entry => entry.kind === 'story' && entry.eventId)) {
        const event = result.find(entry => entry.kind === 'events' && entry.game === placement.game && entry.id === placement.eventId);
        if (event) {placement.name = event.name;}
    }
    return { entries: result, linked, created };
}
