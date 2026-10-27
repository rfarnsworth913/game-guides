import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mainQuestRecords, reworkMainQuestTemplate } from '../../common/main-quest';
import { emptyPatchOverview, PatchOverview, validPatchOverview } from '../../common/story-template';
import { Entry, fromCatalog, toCatalog } from '../../common/workspace';
import { reworkMainQuestDocument } from './main-quest-document';

const template = (): PatchOverview => ({ ...emptyPatchOverview(), groups: [{ id: 'group', title: 'Everwinter Without Mercy' }], rows: [
    { id: 'parent', groupId: 'group', contentType: '', content: 'Everwinter Without Mercy', contentUrl: 'https://example.com/main', patch: '7.0', notes: '* Parent notes', notesRight: 'Right notes' },
    { id: 'one', groupId: 'group', contentType: '', content: 'Into the Wind', contentUrl: 'https://example.com/one', patch: '7.0', notes: '* Child notes', subQuest: true },
    { id: 'two', groupId: 'group', contentType: '', content: 'Gunfire in the Silent Lands', patch: '7.0', notes: '', subQuest: true },
] });

test('explicit content groups remain regular groups through quest conversion and validation', () => {
    const source = template();
    source.groups!.push({ id: 'cutscenes', title: 'Related Cutscenes', groupType: 'content' });
    const cutscene = { id: 'scene', groupId: 'cutscenes', contentType: '', content: 'Related Cutscenes', contentUrl: 'https://example.com/video', patch: '7.0', notes: 'Keep this linked video' };
    source.rows.push(cutscene);
    const result = reworkMainQuestTemplate(source, 'Related Cutscenes');
    assert.equal(result.promoted, 1);
    assert.equal(result.template.groups![1].mainQuest, undefined);
    assert.deepEqual(result.template.rows.find(row => row.id === 'scene'), cutscene);
    assert.ok(validPatchOverview(result.template));
    assert.equal(validPatchOverview({ ...result.template, groups: [{ ...result.template.groups![1], mainQuest: cutscene }] }), false);
    assert.equal(validPatchOverview({ ...result.template, groups: [{ ...result.template.groups![1], groupType: 'invalid' }] }), false);
});

test('main quest conversion moves the original parent intact and preserves child IDs, order, links and progress', () => {
    const original = template();
    const before = structuredClone(original);
    const result = reworkMainQuestTemplate(original, 'Everwinter Without Mercy');
    assert.equal(result.promoted, 1);
    assert.equal(result.normalized, 2);
    assert.deepEqual(original, before);
    assert.deepEqual(result.template.groups![0].mainQuest, before.rows[0]);
    assert.deepEqual(result.template.rows.map(row => row.id), ['one', 'two']);
    assert.equal(result.template.rows.every(row => row.subQuest === false), true);
    assert.equal(mainQuestRecords(result.template).length, before.rows.length);
    assert.ok(validPatchOverview(result.template));
    assert.deepEqual(reworkMainQuestTemplate(result.template, 'Everwinter Without Mercy').template, result.template);
    const entry: Entry = { id: 'entry', game: 'genshin', kind: 'story', category: 'main-story', name: 'Everwinter Without Mercy', order: 0,
        notes: '', day: '', rarity: 1, members: [], requirements: [], completed: false, quantity: 0, target: 0, mainStory: result.template };
    const progress = { completed: false, quantity: 0, target: 0, storyRowCompletion: { parent: true, one: true, two: true } };
    const loaded = fromCatalog(toCatalog(entry), progress);
    assert.equal(loaded.completed, true);
    assert.deepEqual(loaded.storyRowCompletion, progress.storyRowCompletion);
});

test('main quest schema rejects duplicate IDs, unsafe links, and player fields in a heading', () => {
    const migrated = reworkMainQuestTemplate(template(), 'Everwinter Without Mercy').template;
    assert.equal(validPatchOverview({ ...migrated, rows: [...migrated.rows, migrated.groups![0].mainQuest!] }), false);
    assert.equal(validPatchOverview({ ...migrated, groups: [{ ...migrated.groups![0], mainQuest: { ...migrated.groups![0].mainQuest, contentUrl: 'javascript:alert(1)' } }] }), false);
    assert.equal(validPatchOverview({ ...migrated, groups: [{ ...migrated.groups![0], mainQuest: { ...migrated.groups![0].mainQuest, completed: true } }] }), false);
});

test('media groups and unrelated game document fields survive the main quest migration', () => {
    const main = template();
    main.groups!.push({ id: 'media', title: 'Trailers' });
    main.rows.push({ id: 'video', groupId: 'media', contentType: '', content: 'A trailer', patch: '7.0', notes: '' });
    const document = { name: 'Genshin Impact', _revision: 12, characters: [{ raw: 'parser data' }], version: { title: '7.0' },
        story: [{ category: { _id: 'region', title: 'Region', extra: 'keep', content: { other: 'keep', subsections: [
            { id: 'main', category: 'main-story', name: 'Everwinter Without Mercy', mainStory: main, extra: 'keep' },
            { id: 'event', category: 'events', eventStory: { unmodified: true } },
        ] } } }, { parser: 'keep' }] };
    const original = structuredClone(document);
    const result = reworkMainQuestDocument(document);
    assert.deepEqual(document, original);
    assert.equal(result.promoted, 1);
    assert.deepEqual(result.review, [{ guide: 'Everwinter Without Mercy', group: 'Trailers' }]);
    const entries = result.story[0]['category'].content.subsections;
    assert.deepEqual(entries[1], original.story[0].category!.content.subsections[1]);
    assert.equal(entries[0].extra, 'keep');
    assert.equal(result.story[0]['category'].content.other, 'keep');
    assert.equal(result.story[1]['parser'], 'keep');
    assert.equal(reworkMainQuestDocument({ ...document, story: result.story }).guides, 0);
});

test('character quest migration changes only side story payloads and preserves their records', () => {
    const data = template();
    const main = { id: 'main', category: 'main-story', name: 'Everwinter Without Mercy', mainStory: structuredClone(data) };
    const side = { id: 'side', category: 'side-stories', name: 'Everwinter Without Mercy', sideStories: data };
    const document = { name: 'Genshin Impact', story: [{ category: { content: { subsections: [main, side] } } }] };
    const result = reworkMainQuestDocument(document, ['side-stories']);
    const entries = result.story[0]['category'].content.subsections;
    assert.equal(result.promoted, 1);
    assert.equal(result.normalized, 2);
    assert.deepEqual(entries[0], main);
    assert.deepEqual(entries[1].sideStories.groups[0].mainQuest, data.rows[0]);
    assert.deepEqual(entries[1].sideStories.rows.map((row: { id: string }) => row.id), ['one', 'two']);
    assert.equal(reworkMainQuestDocument({ ...document, story: result.story }, ['side-stories']).guides, 0);
});

test('a meeting point quest heading is promoted without consuming reward or exploration rows', () => {
    const data = template();
    data.groups![0].title = 'Meeting Point';
    data.rows[0].content = 'Tidesong Cavern: Quests';
    data.groups!.push({ id: 'rewards', title: 'Tidesong Cavern Rewards' });
    data.rows.push({ id: 'reward', groupId: 'rewards', content: 'Exploration: 10%', contentType: '', patch: '7.0', notes: '' });
    const result = reworkMainQuestTemplate(data, 'Tidesong Cavern');
    assert.equal(result.template.groups![0].mainQuest?.id, 'parent');
    assert.equal(result.template.groups![0].mainQuest?.content, 'Tidesong Cavern: Quests');
    assert.equal(result.template.groups![1].mainQuest, undefined);
    assert.deepEqual(result.template.rows.map(row => row.id), ['one', 'two', 'reward']);
});
