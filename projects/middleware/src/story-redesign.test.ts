import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Entry, fromCatalog, toCatalog, validCatalog } from '../../common/workspace';
import { emptyPatchOverview, validPatchOverview } from '../../common/story-template';
import { storyCompletionKey, storyRowDone, validStoryContext } from '../../common/story-guide';
import { StoryAvailability, StoryRequirementType, StoryTrackingMode } from '../../common/enums/story-tracking.enum';
import { decodeStory, encodeStory, mergeStory } from './story-document';

const section: Entry = { id: 'region', game: 'genshin', kind: 'story-category', name: 'Existing region',
    notes: '', category: '', order: 0, day: '', rarity: 1, members: [], requirements: [], completed: false, quantity: 0, target: 0 };
const guide: Entry = { ...section, id: 'old-guide-id', kind: 'story', category: 'world-quests', storySection: section.id,
    name: 'Existing quest chain', worldQuests: { ...emptyPatchOverview(), sourceName: 'Original attribution', sourceUrl: 'https://example.com/wiki',
        groups: [{ id: 'old-group', title: 'Existing area' }], rows: [
            { id: 'old-heading', rowType: 'heading', groupId: 'old-group', content: 'Existing chain', contentType: '', patch: '', notes: '' },
            { id: 'old-row-id', groupId: 'old-group', content: 'Existing quest', contentType: '', contentUrl: 'https://example.com/quest', patch: '1.0', notes: '* Keep **Markdown**', notesRight: 'Second cell' },
        ] }, storyRowCompletion: { 'old-row-id': true } };

test('redesign reads and round-trips existing guides without rewriting IDs, groups, links or tracking', () => {
    const original = structuredClone(guide);
    const catalog = [toCatalog(section), toCatalog(guide)];
    assert.ok(validCatalog(catalog, 'genshin'));
    const document = encodeStory(catalog);
    const decoded = decodeStory(document, 'genshin');
    assert.deepEqual(decoded.find(entry => entry.id === guide.id), toCatalog(guide));
    const restored = fromCatalog(decoded.find(entry => entry.id === guide.id)!, { completed: false, quantity: 0, target: 0, storyRowCompletion: guide.storyRowCompletion });
    assert.equal(restored.completed, true);
    assert.equal(storyRowDone(restored, restored.worldQuests!.rows[1]), true);
    assert.deepEqual(guide, original);
    const parserRecord = { parsed: 'untouched content' };
    assert.ok(mergeStory([parserRecord, ...document], catalog).some(record => record['parsed'] === parserRecord.parsed));
});

test('optional structured context survives shared catalog round trips while player state is rejected', () => {
    const enriched = structuredClone(guide);
    enriched.worldQuests!.context = { region: 'Mondstadt', area: 'Windrise', chain: 'A chain across versions', availability: StoryAvailability.Permanent,
        relatedContentIds: ['achievement-1'], requirements: [{ type: StoryRequirementType.TimeGate, text: 'Wait until the next daily reset' }] };
    enriched.worldQuests!.rows[1].context = { subtype: 'Hidden Exploration Objective' };
    const catalog = [toCatalog(section), toCatalog(enriched)];
    assert.ok(validCatalog(catalog, 'genshin'));
    assert.deepEqual(decodeStory(encodeStory(catalog), 'genshin').find(entry => entry.id === guide.id)?.worldQuests, enriched.worldQuests);
    assert.equal(validStoryContext({ completed: true }), false);
    assert.equal(validStoryContext({ trackingMode: 'fake' }), false);
    assert.equal(validStoryContext({ availability: 'fake' }), false);
    assert.equal(validStoryContext({ startDate: '2026-10-20', endDate: '2026-10-01' }), false);
    assert.equal(validStoryContext({ requirements: [{ type: 'unlock', text: 'Safe', completed: true }] }), false);
    assert.equal(validPatchOverview({ ...enriched.worldQuests, context: { userProgress: {} } }), false);
});

test('recurring progress uses independent cycle keys and never overwrites lifetime or earlier cycles', () => {
    const activity: Entry = { ...guide, category: 'endgame-activity', eventStory: { ...emptyPatchOverview(), context: { trackingMode: StoryTrackingMode.Recurring, cycleId: 'season-1' },
        rows: [{ id: 'stage', contentType: '', content: 'Stage 1', patch: '', notes: '' }] },
        storyRowCompletion: { stage: true, 'cycle:season-1:stage': true } };
    const row = activity.eventStory!.rows[0];
    assert.equal(storyCompletionKey(activity, row), 'cycle:season-1:stage');
    assert.equal(storyRowDone(activity, row), true);
    activity.eventStory!.context!.cycleId = 'season-2';
    assert.equal(storyRowDone(activity, row), false);
    assert.equal(activity.storyRowCompletion!['cycle:season-1:stage'], true);
    assert.equal(activity.storyRowCompletion!['stage'], true);
    delete activity.eventStory!.context!.cycleId;
    assert.equal(storyCompletionKey(activity, row), null);
    row.context = { trackingMode: StoryTrackingMode.Completed };
    assert.equal(storyRowDone(activity, row), true);
});
