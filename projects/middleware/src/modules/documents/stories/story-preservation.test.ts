import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entry, EventCatalogEntry, CharacterCatalogEntry } from '@lib/types/workspace.type';
import { emptyPatchOverview } from '@common/quests/story-template';
import { storyTemplateFor, storyRowDone } from '@common/quests/story-guide';
import { removePreservedStoryField, reconcilePreservedFieldRemovals } from '@common/quests/story-preservation';
import { preservedTemplateFields } from '@common/quests/template-conversion';
import { resolveEventReferences, editEventStory } from '@common/events/event-story';
import { resolveCharacterReferences, editCharacterStory } from '@common/characters/character-story';
import { toCatalog, fromCatalog, validCatalog } from '@common/workspace/workspace';
import { encodeStory, decodeStory } from './story-document';

const section: Entry = { id: 'region', game: 'genshin', kind: 'story-category', name: 'Region', category: '', notes: '', day: '', order: 0, rarity: 1, members: [], requirements: [], completed: false, quantity: 0, target: 0 };
const profile = { ...emptyPatchOverview(), rows: [{ id: 'objective', content: 'Quest', contentType: '', patch: '1.0', notes: 'Keep me' }] };

await test('explicit context removals survive repeated save/decode/reopen of a linked activity', () => {
    let event = toCatalog({ ...section, id: 'event', kind: 'events', category: 'temporary', eventType: 'permanent', startDate: '2026-11-01', endDate: '2026-12-01', eventStory: profile }) as EventCatalogEntry;
    let placement = toCatalog({ ...section, id: 'activity', kind: 'story', category: 'endgame-activity', storySection: section.id, eventId: event.id });
    const other = { ...placement, id: 'other', category: 'events' };
    const state = { completed: true, quantity: 0, target: 0, storyRowCompletion: { objective: true } };
    const project = () => fromCatalog(resolveEventReferences([event, placement]).find(item => item.id === placement.id)!, state);
    let draft = project();
    removePreservedStoryField(draft, storyTemplateFor(draft)!, 'context');
    for (let save = 0; save < 3; save++) {
        const data = storyTemplateFor(draft)!;
        // The editor recreates a context for Activity Type, even after context removal.
        data.context ??= {};
        if (save > 0) {data.context.subtype = 'Combat simulation';}
        reconcilePreservedFieldRemovals(draft);
        event = editEventStory(event, data);
        placement = toCatalog(draft);
        assert.equal(validCatalog([toCatalog(section), event, placement], 'genshin'), true);
        const stored = encodeStory([toCatalog(section), placement]);
        const placementId = placement.id;
        placement = decodeStory(JSON.parse(JSON.stringify(stored)) as Record<string, unknown>[], 'genshin').find(item => item.id === placementId)!;
        draft = project();
        assert.equal(preservedTemplateFields(draft).includes('context'), false);
        assert.equal(storyTemplateFor(draft)?.context?.availability, globalThis.undefined);
        assert.equal(storyTemplateFor(draft)?.context?.startDate, globalThis.undefined);
        assert.equal(storyTemplateFor(draft)?.context?.endDate, globalThis.undefined);
        if (save > 0) {assert.equal(storyTemplateFor(draft)?.context?.subtype, 'Combat simulation');}
        assert.equal(storyRowDone(draft, profile.rows[0]), true);
    }
    assert.equal(event.eventType, 'permanent'); assert.equal(event.startDate, '2026-11-01'); assert.equal(event.endDate, '2026-12-01');
    const projectedOther = resolveEventReferences([event, other]).find(item => item.id === other.id)!;
    assert.equal(storyTemplateFor(projectedOther)?.context?.availability, 'permanent');
    assert.equal(storyTemplateFor(projectedOther)?.context?.startDate, event.startDate);
    const reintroduced = storyTemplateFor(draft)!;
    reintroduced.context!.startDate = '2026-11-15';
    reconcilePreservedFieldRemovals(draft);
    assert.equal(draft.removedPreservedFields?.includes('context.startDate'), false);
});

await test('removed derived character attributes stay removed without deleting shared character identity', () => {
    let character = toCatalog({ ...section, id: 'character', kind: 'characters', name: 'Hero', characterInformation: profile }) as CharacterCatalogEntry;
    let placement = toCatalog({ ...section, id: 'lore', kind: 'story', category: 'lore', storySection: section.id, characterId: character.id });
    let draft = fromCatalog(resolveCharacterReferences([character, placement]).find(item => item.id === placement.id)!);
    removePreservedStoryField(draft, storyTemplateFor(draft)!, 'characterName');
    character = editCharacterStory(character, storyTemplateFor(draft)!);
    placement = toCatalog(draft);
    draft = fromCatalog(resolveCharacterReferences([character, placement]).find(item => item.id === placement.id)!);
    assert.equal(storyTemplateFor(draft)?.characterName, globalThis.undefined);
    assert.equal(character.name, 'Hero');
    assert.equal(validCatalog([toCatalog(section), character, placement], 'genshin'), true);
    for (const fields of [['rows'], ['context.__proto__'], ['characterName', 'characterName']]) {
        assert.equal(validCatalog([toCatalog(section), character, { ...placement, removedPreservedFields: fields }], 'genshin'), false);
    }
});
