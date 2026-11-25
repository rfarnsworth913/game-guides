import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entry, EventCatalogEntry, CharacterCatalogEntry } from '@lib/types/workspace.type';
import { templateRegistry, templateFields, convertStoryTemplate } from '@common/quests/template-conversion';
import { storyTemplateFor, storyRowDone, storyCompletionKey } from '@common/quests/story-guide';
import { emptyPatchOverview, validPatchOverview } from '@common/quests/story-template';
import { StoryTrackingMode } from '@lib/enums/story-tracking.enum';
import { fromCatalog, toCatalog, validCatalog } from '@common/workspace/workspace';
import { resolveEventReferences, migrateStoryEvents } from '@common/events/event-story';
import { resolveCharacterReferences } from '@common/characters/character-story';
import { validateStoryProgress } from './story-progress.service';
import { encodeStory, decodeStory } from './story-document';

const base: Entry = { id: 'section', game: 'genshin', kind: 'story-category', name: 'Region', category: '', notes: '', quantity: 0, target: 0, completed: false, rarity: 1, members: [], requirements: [], order: 0, day: '' };
const data = { ...emptyPatchOverview(), imageUrl: 'https://example.com/art.webp', imageAlt: 'Artwork', sourceName: 'Artist', sourceUrl: 'https://example.com',
    patchVersion: '1.0', summary: 'Keep the summary', groups: [{ id: 'group', title: 'Objectives' }],
    rows: [{ id: 'objective', groupId: 'group', content: 'Existing objective', contentType: '', notes: 'Keep notes', patch: '1.0', contentUrl: 'https://example.com/quest' }] };
const entry: Entry = { ...base, id: 'placement', kind: 'story', storySection: base.id, name: 'Activity', category: 'events', eventStory: data, storyRowCompletion: { objective: true } };

await test('all template pairs preserve shared content, identity and completion without mutating the draft source', () => {
    for (const source of templateRegistry.filter(item => item.groups)) {
        const field = templateFields[source.id as keyof typeof templateFields];
        const original = { ...entry, category: source.id, eventStory: globalThis.undefined, [field]: structuredClone(data) };
        const before = structuredClone(original);
        for (const target of templateRegistry) {
            const result = convertStoryTemplate(original, target.id);
            assert.deepEqual(original, before);
            assert.equal(result.entry.id, entry.id);
            assert.deepEqual(result.entry.storyContent?.rows, data.rows);
            assert.deepEqual(result.entry.storyContent?.groups, data.groups);
            assert.equal(result.entry.storyContent?.imageUrl, data.imageUrl);
            assert.equal(validPatchOverview(result.entry.storyContent), true);
            assert.equal(storyRowDone(result.entry, data.rows[0]), true);
            const catalog = toCatalog(result.entry);
            assert.equal(validCatalog([toCatalog(base), catalog], 'genshin'), true);
            const decoded = decodeStory(encodeStory([toCatalog(base), catalog]) as unknown as Record<string, unknown>[], 'genshin').find(item => item.id === entry.id)!;
            assert.deepEqual(decoded.storyContent, result.entry.storyContent);
            const back = convertStoryTemplate(result.entry, source.id).entry;
            assert.deepEqual(storyTemplateFor(back)?.rows, data.rows);
        }
    }
});

await test('distinct legacy drafts and unsupported attributes are retained, and divider titles survive saving', () => {
    const source = { ...entry, eventStory: { ...structuredClone(data), damageType: 'Physical' }, lore: { ...emptyPatchOverview(), summary: 'A different existing draft' } };
    const result = convertStoryTemplate(source, 'lore');
    assert.equal(result.requiresConfirmation, true);
    assert.equal(result.entry.storyContent?.damageType, 'Physical');
    assert.equal(result.entry.storyContent?.preservedTemplates?.[0].content.summary, 'A different existing draft');
    assert.equal(validPatchOverview(result.entry.storyContent), true);
    const divider = convertStoryTemplate(result.entry, 'divider').entry;
    divider.name = '';
    assert.equal(convertStoryTemplate(divider, 'events').entry.name, entry.name);
    assert.equal(storyTemplateFor(divider), globalThis.undefined);
});

await test('shared event/character references survive conversion and cycle changes retain historical progress', () => {
    const event = toCatalog({ ...entry, id: 'event', kind: 'events', category: 'end-game' }) as EventCatalogEntry;
    event.startDate = '2026-11-01T23:00:00-05:00';
    event.endDate = '2026-12-01T23:00:00-05:00';
    const linked = { ...entry, eventId: event.id };
    for (const target of ['endgame-activity', 'main-story', 'lore', 'world-quests']) {
        const result = convertStoryTemplate(linked, target).entry;
        const saved = toCatalog(result);
        assert.equal(saved.eventId, event.id);
        assert.equal(saved.storyContent, globalThis.undefined);
        assert.equal(validCatalog([toCatalog(base), event, saved], 'genshin'), true);
        const projected = resolveEventReferences([event, saved]).find(item => item.id === entry.id)!;
        assert.deepEqual(storyTemplateFor(projected)?.rows, data.rows);
        assert.equal(storyTemplateFor(projected)?.context?.endDate, event.endDate);
        assert.equal(validPatchOverview(storyTemplateFor(projected)), true);
        assert.equal(storyRowDone(fromCatalog(projected, linked), data.rows[0]), true);
    }
    const character = toCatalog({ ...entry, id: 'character', kind: 'characters', characterInformation: data, eventStory: globalThis.undefined }) as CharacterCatalogEntry;
    const convertedCharacter = convertStoryTemplate({ ...entry, category: 'character-information', eventStory: globalThis.undefined, characterInformation: data, characterId: character.id }, 'lore').entry;
    const resolved = resolveCharacterReferences([character, toCatalog(convertedCharacter)]).find(item => item.id === entry.id)!;
    assert.deepEqual(storyTemplateFor(resolved)?.rows, data.rows);
    const recurring = convertStoryTemplate(entry, 'endgame-activity').entry;
    recurring.storyContent!.context = { trackingMode: StoryTrackingMode.Recurring, cycleId: 'second' };
    const history = { objective: true, 'cycle:first:objective': true };
    const state = { completed: false, quantity: 0, target: 0, storyRowCompletion: history };
    validateStoryProgress(toCatalog(recurring), state, history);
    assert.equal(storyCompletionKey(recurring, data.rows[0]), 'cycle:second:objective');
    assert.equal(storyRowDone({ ...recurring, storyRowCompletion: history }, data.rows[0]), false);
    assert.deepEqual(history, { objective: true, 'cycle:first:objective': true });
    const migrated = migrateStoryEvents([toCatalog(base), toCatalog(convertStoryTemplate({ ...entry, eventId: globalThis.undefined }, 'endgame-activity').entry)], () => 'new-event');
    assert.equal(migrated.created, 0);
    assert.equal(migrated.entries.some(item => item.kind === 'events'), false);
    assert.deepEqual(migrated.entries.find(item => item.id === entry.id)?.storyContent?.rows, data.rows);
});
