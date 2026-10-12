import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CatalogEntry, validCatalog } from '../../common/workspace';
import { decodeEntries, encodeEntries, mergeEntries, migrateDocument } from './game-document';

const section: CatalogEntry = {
    id: 'mondstadt',
    game: 'genshin',
    kind: 'story-category',
    name: 'Mondstadt',
    icon: 'wind',
    order: 1,
    notes: '',
    category: '',
    rarity: 1,
    day: '',
    members: [],
    requirements: [],
};
const step: CatalogEntry = {
    ...section,
    id: 'prologue',
    kind: 'story',
    name: 'Prologue',
    category: 'main-story',
    storySection: section.id,
    notes: 'Follow the wind.',
};

test('story sections use category/content wrappers and preserve stable subsection IDs on round trip', () => {
    const document = encodeEntries([section, step]);
    assert.deepEqual(document['story'][0], {
        category: {
            _id: 'mondstadt',
            title: 'Mondstadt',
            order: 1,
            icon: 'wind',
            content: { subsections: [step] },
        },
    });
    const decoded = decodeEntries(document, 'genshin');
    assert.deepEqual(decoded, [section, step]);
    assert.ok(validCatalog(decoded, 'genshin'));
    assert.equal(validCatalog([step], 'genshin'), false);
    assert.equal(validCatalog([section, { ...step, storySection: 'missing' }], 'genshin'), false);
});

test('legacy story migration creates General while preserving notes, ordering and IDs', () => {
    const { storySection, ...legacy } = step;
    const migrated = migrateDocument({ story: [legacy], _schemaVersion: 2, _revision: 4 });
    const parent = migrated['story'][0].category;
    assert.equal(parent.title, 'General');
    assert.equal(parent.content.subsections[0].id, step.id);
    assert.equal(parent.content.subsections[0].notes, step.notes);
    assert.equal(parent.content.subsections[0].order, step.order);
    assert.equal(migrated['_revision'], 4);
    assert.ok(validCatalog(decodeEntries(migrated, 'genshin'), 'genshin'));
    assert.deepEqual(migrateDocument(migrated), migrated);
});

test('section edits preserve extra content fields; removal clears nested story data', () => {
    const document = encodeEntries([section, step]);
    document['story'][0].category.content.summary = 'Keep this future template content';
    const edited = mergeEntries(document, [{ ...section, name: 'New title' }, step]);
    assert.equal(edited['story'][0].category.title, 'New title');
    assert.equal(edited['story'][0].category.content.summary, 'Keep this future template content');
    assert.deepEqual(mergeEntries(edited, [])['story'], []);
});
