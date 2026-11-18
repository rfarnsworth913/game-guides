import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogEntry } from '../../../../lib/types/workspace.type';
import { emptyPatchOverview } from '../../../../common/quests/story-template';
import { migrateStoryEvents, resolveEventReferences, editEventStory, eventStoryProfile } from '../../../../common/events/event-story';
import { validCatalog, fromCatalog, toCatalog } from '../../../../common/workspace/workspace';
import { encodeEntries, decodeEntries, mergeEntries } from '../documents/game-document';
import { validateStoryProgress } from '../documents/stories/story-progress.service';
import { migrateEventDocument } from './event-story-migration';

const base: CatalogEntry = { id: 'region', game: 'genshin', kind: 'story-category', name: 'Region', notes: '', category: '', rarity: 1, members: [], requirements: [], order: 0, day: '' };
const story: CatalogEntry = { ...base, id: 'story-event', kind: 'story', storySection: base.id, category: 'events', name: 'Festival', eventStory: {
    ...emptyPatchOverview(), summary: 'Shared event description', imageUrl: 'https://example.com/banner.webp', sourceName: 'Official', sourceUrl: 'https://example.com',
    groups: [{ id: 'quests', title: 'Festival quests' }], rows: [{ id: 'original-row', groupId: 'quests', content: 'Festival quest', contentType: '', patch: '1.0', notes: 'Keep this note', contentUrl: 'https://example.com/quest' }],
} };

await test('events migrate idempotently with unchanged placement and private completion IDs', () => {
    const source = [base, story], before = structuredClone(source);
    const result = migrateStoryEvents(source, () => 'shared-event');
    assert.equal(result.created, 1); assert.equal(result.linked, 1);
    assert.deepEqual(source, before);
    assert.equal(validCatalog(result.entries, 'genshin'), true);
    assert.deepEqual(migrateStoryEvents(result.entries).entries, result.entries);
    const placement = result.entries.find(entry => entry.id === story.id)!;
    assert.equal(placement.eventId, 'shared-event'); assert.equal(placement.eventStory, globalThis.undefined);
    assert.equal(placement.storySection, story.storySection); assert.equal(placement.order, story.order);
    const projected = resolveEventReferences(result.entries).find(entry => entry.id === story.id)!;
    assert.deepEqual(projected.eventStory?.rows, story.eventStory?.rows);
    assert.equal(projected.eventStory?.summary, story.eventStory?.summary);
    const player = { completed: true, quantity: 0, target: 0, storyRowCompletion: { 'original-row': true } };
    assert.equal(fromCatalog(projected, player).completed, true);
    assert.doesNotThrow(() => validateStoryProgress(projected, player, {}));
    assert.equal(toCatalog(fromCatalog(projected, player)).eventStory, globalThis.undefined);
    assert.equal(validCatalog(result.entries.filter(entry => entry.id !== 'shared-event'), 'genshin'), false);
    assert.equal(validCatalog(result.entries.map(entry => entry.id === 'shared-event' ? { ...entry, game: 'hsr' } : entry), 'genshin'), false);
});

await test('reuses a parser event ID and retains raw source provenance through database round trips', () => {
    const raw = { title: 'Festival', eventType: 'temporary', startDate: '2026-10-01T04:00:00Z', endDate: '2026-10-31T04:00:00Z', url: 'https://example.com/festival', unknown: 'preserved' };
    const source = { name: 'Genshin Impact', ...encodeEntries([base, story]), other: { untouched: true } };
    source.events = [raw] as typeof source.events;
    const original = structuredClone(source);
    const migrated = migrateEventDocument(source);
    const entries = decodeEntries({ ...source, ...migrated }, 'genshin');
    const event = entries.find(entry => entry.kind === 'events')!;
    assert.equal(entries.filter(entry => entry.kind === 'events').length, 1);
    assert.equal(event.id, decodeEntries({ events: [raw] }, 'genshin')[0].id);
    assert.equal(event.startDate, raw.startDate); assert.equal(event.wikiUrl, raw.url);
    assert.deepEqual(migrated.events[0], raw);
    assert.equal(resolveEventReferences(entries).find(entry => entry.id === story.id)?.eventStory?.rows[0].id, 'original-row');
    const roundTrip = mergeEntries({ ...source, ...migrated }, entries);
    assert.deepEqual(decodeEntries(roundTrip, 'genshin'), entries);
    assert.equal(migrateEventDocument({ ...source, ...migrated }).linked, 0);
    assert.deepEqual(source, original);
});

await test('edits one shared definition, projects copies to all placements and keeps catalog progress separate', () => {
    const second = { ...story, id: 'another-placement' };
    const migrated = migrateStoryEvents([base, story, second], () => 'shared-event');
    const event = migrated.entries.find(entry => entry.kind === 'events')!;
    const draft = eventStoryProfile(event); draft.summary = 'New description'; draft.context = { ...draft.context, startDate: '2026-10-01' };
    const changed = editEventStory(event, draft, 'Renamed Festival');
    const projected = resolveEventReferences(migrated.entries.map(entry => entry.id === event.id ? changed : entry));
    for (const placement of projected.filter(entry => entry.kind === 'story')) {
        assert.equal(placement.name, 'Renamed Festival'); assert.equal(placement.eventStory?.summary, 'New description'); assert.equal(placement.eventStory?.context?.startDate, '2026-10-01');
    }
    projected.find(entry => entry.id === story.id)!.eventStory!.rows[0].notes = 'Local draft';
    assert.equal(projected.find(entry => entry.id === second.id)!.eventStory!.rows[0].notes, 'Keep this note');
    assert.equal(event.eventStory?.rows[0].notes, 'Keep this note');
});

await test('rejects ambiguous periods, conflicting profile data, and ID collisions without modifying input', () => {
    const event = { ...base, kind: 'events' as const, id: 'first', name: 'Festival', eventStory: { ...emptyPatchOverview(), sourceName: 'Different source' } };
    assert.throws(() => migrateStoryEvents([base, story, event]), /conflicting sourceName/);
    assert.throws(() => migrateStoryEvents([base, story, event, { ...event, id: 'second' }]), /multiple event periods/);
    assert.throws(() => migrateStoryEvents([base, story], () => base.id), /collision/);
    const dated = structuredClone(story); dated.eventStory!.context = { startDate: '2026-11-01' };
    assert.throws(() => migrateStoryEvents([base, dated, { ...event, eventStory: globalThis.undefined, startDate: '2026-10-01' }]), /conflicting startDate/);
});
