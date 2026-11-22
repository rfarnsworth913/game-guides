import { createHash } from 'node:crypto';
import type { StoredStory } from '../documents/stored-document.types';
import { decodeEntries } from '../documents/game-document';
import { migrateStoryEvents, eventNameKey } from '@common/events/event-story';
import { validCatalog } from '@common/workspace/workspace';
import { GAMES } from '@lib/constants/workspace.constants';

/** Touch only event definitions and event guide placements, retaining unknown document metadata. */
export function migrateEventDocument(document: Record<string, unknown>) {
    const existingStory = (document['story'] ?? []) as StoredStory[];
    const hasLegacy = existingStory.some(section => (section['kind'] === 'story' ? [section] : section.category?.content?.subsections ?? []).some(entry => entry['category'] === 'events' && !entry['eventId']));
    if (!hasLegacy) {return { story: existingStory, events: (document['events'] ?? []) as Record<string, unknown>[], linked: 0, created: 0 };}
    const game = typeof document['_gameId'] === 'string' ? document['_gameId'] : GAMES.find(item => item.name.replace(':', '') === String(document['name']).replace(':', ''))?.id;
    if (!game) {throw new Error(`Unknown game document: ${String(document['name'])}`);}
    const migrated = migrateStoryEvents(decodeEntries(document, game), (id, name) => 'event-' + createHash('sha256').update(id + '/' + eventNameKey(name)).digest('hex').slice(0, 24));
    if (!validCatalog(migrated.entries, game)) {throw new Error(`Migrated catalog validation failed: ${String(document['name'])}. Original data has not been changed.`);}
    const byId = new Map(migrated.entries.map(entry => [entry.id, entry]));
    const rewrite = (entry: Record<string, unknown>) => {
        const saved = byId.get(String(entry['id']));
        if (!saved?.eventId || entry['category'] !== 'events') {return entry;}
        const result: Record<string, unknown> = { ...entry, name: saved.name, eventId: saved.eventId };
        delete result['eventStory'];
        return result;
    };
    const story = ((document['story'] ?? []) as StoredStory[]).map(section => {
        if (section['kind'] === 'story') {return rewrite(section);}
        if (!section.category?.content?.subsections) {return section;}
        return { ...section, category: { ...section.category, content: { ...section.category.content, subsections: section.category.content.subsections.map(rewrite) } } };
    });
    const old = (document['events'] ?? []) as Record<string, unknown>[];
    const ids = new Set(old.map(entry => String(entry['id'])));
    const events = [...old.map(entry => byId.get(String(entry['id']))?.kind === 'events' ? { ...entry, ...byId.get(String(entry['id'])) } : entry),
        ...migrated.entries.filter(entry => entry.kind === 'events' && entry.eventStory && !ids.has(entry.id))];
    return { story, events, linked: migrated.linked, created: migrated.created };
}
