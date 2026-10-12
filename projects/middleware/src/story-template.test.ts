import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Entry, fromCatalog, toCatalog, validCatalog, parseBackup } from '../../common/workspace';
import { validPatchOverview, patchGroups, preparePatchGroups } from '../../common/story-template';
import { encodeEntries, decodeEntries } from './game-document';

const section: Entry = {
    id: 'section',
    game: 'genshin',
    kind: 'story-category',
    name: '6.0',
    order: 0,
    notes: '',
    category: '',
    rarity: 1,
    day: '',
    members: [],
    requirements: [],
    completed: false,
    quantity: 0,
    target: 0,
};
const patch: Entry = {
    ...section,
    id: 'patch',
    kind: 'story',
    storySection: section.id,
    category: 'patch-overview',
    patchOverview: {
        versionImageUrl: '/api/games/genshin/images/version-background.png',
        imageUrl: 'https://example.com/patch.jpg',
        imageAlt: 'Patch banner',
        sourceName: 'Official site',
        sourceUrl: 'https://example.com',
        rows: [
            {
                id: 'merged',
                contentType: 'Story',
                content: 'Chapter 1',
                patch: '6.0',
                notes: 'Two columns',
            },
            {
                id: 'split',
                subQuest: true,
                contentType: 'Event',
                content: 'Festival',
                patch: '6.0',
                notes: 'Left',
                notesRight: 'Right',
            },
        ],
    },
    storyRowCompletion: { merged: true, split: false },
};
test('patch template survives database round trips while row completion stays out of shared documents', () => {
    const catalog = [section, patch].map(toCatalog);
    assert.ok(validCatalog(catalog, 'genshin'));
    const document = encodeEntries(catalog);
    assert.ok(!JSON.stringify(document).includes('storyRowCompletion'));
    assert.ok(!JSON.stringify(document).includes('completed'));
    const decoded = decodeEntries(document, 'genshin').find((entry) => entry.id === patch.id)!;
    assert.deepEqual(decoded.patchOverview, patch.patchOverview);
    assert.equal(fromCatalog(decoded).storyRowCompletion, undefined);
    assert.equal(
        fromCatalog(decoded, {
            completed: false,
            quantity: 0,
            target: 0,
            storyRowCompletion: { merged: true, split: true },
        }).completed,
        true,
    );
    const restored = parseBackup(JSON.stringify({ version: 1, entries: [section, patch] }));
    assert.deepEqual(
        restored.find((entry) => entry.id === patch.id)?.storyRowCompletion,
        patch.storyRowCompletion,
    );
});
test('template validation rejects unsafe URLs, duplicate row IDs and nested completion state', () => {
    assert.ok(validPatchOverview({ ...patch.patchOverview, imageUrl: '/api/games/genshin/images/header.png' }));
    assert.equal(validPatchOverview({ ...patch.patchOverview, versionImageUrl: 'javascript:alert(1)' }), false);
    assert.equal(validPatchOverview({ ...patch.patchOverview, imageUrl: '/api/games/genshin/images/../secret.png' }), false);
    assert.equal(
        validPatchOverview({ ...patch.patchOverview, imageUrl: 'javascript:alert(1)' }),
        false,
    );
    const row = patch.patchOverview!.rows[0];
    assert.equal(validPatchOverview({ ...patch.patchOverview, rows: [{ ...row, subQuest: 'yes' }] }), false);
    assert.equal(validPatchOverview({ ...patch.patchOverview, rows: [row, row] }), false);
    assert.equal(
        validPatchOverview({ ...patch.patchOverview, rows: [{ ...row, completed: true }] }),
        false,
    );
    assert.equal(
        validCatalog(
            [toCatalog(section), { ...toCatalog(patch), storyRowCompletion: {} }],
            'genshin',
        ),
        false,
    );
});

test('legacy content types become editable groups without changing row IDs or notes', () => {
    const overview = structuredClone(patch.patchOverview!);
    const ids = overview.rows.map((row) => row.id);
    assert.deepEqual(
        patchGroups(overview).map((group) => group.title),
        ['Story', 'Event'],
    );
    preparePatchGroups(overview);
    assert.deepEqual(
        overview.rows.map((row) => row.id),
        ids,
    );
    assert.equal(overview.rows[1].notesRight, 'Right');
    assert.ok(validPatchOverview(overview));
    overview.rows[0].contentUrl = 'https://example.com/trailer';
    assert.ok(validPatchOverview(overview));
    overview.rows[0].contentUrl = 'javascript:alert(1)';
    assert.equal(validPatchOverview(overview), false);
    overview.rows[0].contentUrl = '';
    overview.rows[0].groupId = 'missing';
    assert.equal(validPatchOverview(overview), false);
});


test('main story definitions persist independently and completion stays local', () => {
    const main: Entry = { ...patch, category: 'main-story', patchOverview: undefined,
        mainStory: { ...patch.patchOverview!, region: 'Mondstadt', subtitle: 'City of Freedom', patchVersion: '1.0?1.2' } };
    const catalog = [section, main].map(toCatalog);
    // JSON transport omits undefined fields.
    const transported = JSON.parse(JSON.stringify(catalog));
    assert.ok(validCatalog(transported, 'genshin'));
    const document = encodeEntries(transported);
    const decoded = decodeEntries(document, 'genshin').find((entry) => entry.id === main.id)!;
    assert.deepEqual(decoded.mainStory, main.mainStory);
    assert.ok(!JSON.stringify(document).includes('storyRowCompletion'));
    assert.equal(fromCatalog(decoded).completed, false);
    assert.equal(fromCatalog(decoded, { completed: false, quantity: 0, target: 0,
        storyRowCompletion: { merged: true, split: true } }).completed, true);
});


test('world quest headings and notes persist but do not count toward completion', () => {
    const quest: Entry = { ...patch, category: 'world-quests', patchOverview: undefined,
        worldQuests: { ...patch.patchOverview!, rows: [
            { ...patch.patchOverview!.rows[0], id: 'heading', rowType: 'heading', content: 'Mondstadt' },
            { ...patch.patchOverview!.rows[0], id: 'note', rowType: 'note', notes: '**Global note**' },
            { ...patch.patchOverview!.rows[0], rowType: 'quest' },
        ] } };
    const catalog = JSON.parse(JSON.stringify([section, quest].map(toCatalog)));
    assert.ok(validCatalog(catalog, 'genshin'));
    const decoded = decodeEntries(encodeEntries(catalog), 'genshin').find((entry) => entry.id === quest.id)!;
    assert.deepEqual(decoded.worldQuests, quest.worldQuests);
    assert.equal(fromCatalog(decoded).completed, false);
    assert.equal(fromCatalog(decoded, { completed: false, quantity: 0, target: 0, storyRowCompletion: { merged: true } }).completed, true);
    assert.equal(validPatchOverview({ ...quest.worldQuests, rows: [{ ...quest.worldQuests!.rows[0], rowType: 'invalid' }] }), false);
});


test('side story definitions round-trip with player completion kept local', () => {
    const side: Entry = { ...patch, category: 'side-stories', patchOverview: undefined,
        sideStories: structuredClone(patch.patchOverview!) };
    const catalog = JSON.parse(JSON.stringify([section, side].map(toCatalog)));
    assert.ok(validCatalog(catalog, 'genshin'));
    const document = encodeEntries(catalog);
    const decoded = decodeEntries(document, 'genshin').find((entry) => entry.id === side.id)!;
    assert.deepEqual(decoded.sideStories, side.sideStories);
    assert.equal(decoded.patchOverview, undefined);
    assert.ok(!JSON.stringify(document).includes('storyRowCompletion'));
    assert.equal(fromCatalog(decoded).completed, false);
    assert.equal(fromCatalog(decoded, { completed: false, quantity: 0, target: 0,
        storyRowCompletion: { merged: true, split: true } }).completed, true);
});
