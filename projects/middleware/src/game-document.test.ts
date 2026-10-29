import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CatalogEntry, validCatalog } from '../../common/workspace';
import {
    decodeEntries,
    encodeEntries,
    mergeEntries,
    migrateDocument,
    GAME_ARRAYS,
} from './game-document';

const category: CatalogEntry = {
    id: 'category',
    game: 'genshin',
    kind: 'achievement-category',
    name: 'Exploration',
    notes: '',
    category: '',
    rarity: 1,
    members: [],
    requirements: [],
    order: 10,
    day: '',
    icon: 'https://example.com/category.png',
    reward: '20',
    rewardIcon: 'gem',
    description: 'Category description',
    wikiUrl: 'https://example.com/category',
};
const achievement: CatalogEntry = {
    ...category,
    id: 'achievement',
    kind: 'achievements',
    category: category.id,
    name: 'Discover a region',
    notes: 'Legacy notes',
    requirementText: 'Explore the region',
    order: 2,
};

test('existing nested string orders migrate to integers without changing IDs or revision', () => {
    const document = encodeEntries([category, achievement]);
    document['achievements'][0].order = '10';
    document['achievements'][0].achievements[0].order = '2';
    const migrated = migrateDocument({ ...document, _schemaVersion: 2, _revision: 7 });
    assert.equal(migrated['achievements'][0].order, 10);
    assert.equal(migrated['achievements'][0].achievements[0].order, 2);
    assert.equal(migrated['_revision'], 7);
    assert.equal(migrated['achievements'][0].achievements[0]._id, achievement.id);
    assert.equal(validCatalog([{ ...category, order: 1.5 }], 'genshin'), false);
});

test('migration refuses orphaned achievements instead of silently losing them', () => {
    assert.throws(
        () =>
            migrateDocument({
                name: 'Genshin Impact',
                catalog: { achievements: [achievement] },
            }),
        /invalid entries or references/,
    );
});

void test('parser events are exposed with dates and stable period IDs without duplicating or changing database records', () => {
    const event = {
        title: 'Challenge',
        url: 'https://example.com/challenge',
        eventType: 'temporary',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        icon: 'icons/game/challenge.svg',
        completed: true,
    };
    const document = { events: [event] };
    const [entry] = decodeEntries(document, 'genshin');
    assert.equal(entry.name, event.title);
    assert.equal(entry.wikiUrl, event.url);
    assert.equal(entry.eventType, event.eventType);
    assert.equal(entry.startDate, event.startDate);
    assert.equal(entry.endDate, event.endDate);
    assert.equal('completed' in entry, false);
    assert.equal(validCatalog([entry], 'genshin'), true);
    assert.equal(decodeEntries(document, 'genshin')[0].id, entry.id);
    assert.notEqual(decodeEntries(document, 'hsr')[0].id, entry.id);
    assert.notEqual(
        decodeEntries(
            { events: [{ ...event, startDate: '2026-11-01', endDate: '2026-11-30' }] },
            'genshin',
        )[0].id,
        entry.id,
    );
    const merged = mergeEntries(document, [entry, category, achievement]);
    assert.deepEqual(merged['events'], [event]);
    assert.equal(
        decodeEntries(merged, 'genshin').filter((item) => item.kind === 'events').length,
        1,
    );
    const reordered = decodeEntries(
        { events: [{ ...event, title: 'Another event' }, event] },
        'genshin',
    );
    assert.equal(reordered.find((item) => item.name === event.title)?.id, entry.id);
});

test('nested achievement documents map to stable browser IDs, references, links and requirements', () => {
    const encoded = encodeEntries([category, achievement]);
    assert.equal(encoded['achievements'][0]._id, category.id);
    assert.equal(encoded['achievements'][0].order, 10);
    const saved = encoded['achievements'][0].achievements[0];
    assert.equal(saved._id, achievement.id);
    assert.equal(saved.requirements, achievement.requirementText);
    assert.equal(saved.url, achievement.wikiUrl);
    assert.equal(saved.notes, achievement.notes);
    assert.ok(!('completed' in saved) && !('game' in saved) && !('category' in saved));
    const decoded = decodeEntries(encoded, 'genshin');
    assert.deepEqual(decoded, [category, achievement]);
    assert.ok(validCatalog(decoded, 'genshin'));
});

test('migration retains parser records, version and revision while removing parser progress defaults', () => {
    const original = {
        name: 'Genshin Impact',
        version: { title: '6.0', releaseDate: '2026-01-01', url: 'https://example.com' },
        events: [{ title: 'Parsed event', url: 'https://example.com/event', completed: false }],
        catalog: {
            revision: 5,
            achievementCategories: [category],
            achievements: [achievement],
            events: [{ ...category, id: 'manual-event', kind: 'events' }],
        },
    };
    const migrated = migrateDocument(original);
    assert.equal(migrated['_revision'], 5);
    assert.deepEqual(migrated['version'], original.version);
    assert.deepEqual(migrated['events'][0], {
        title: 'Parsed event',
        url: 'https://example.com/event',
    });
    assert.equal(migrated['events'].length, 2);
    assert.equal(migrated['achievements'][0].achievements[0]._id, achievement.id);
    for (const field of GAME_ARRAYS) assert.ok(Array.isArray(migrated[field]));
    const next = mergeEntries(migrated, []);
    assert.deepEqual(next['events'], [migrated['events'][0]]);
    assert.deepEqual(next['achievements'], []);
    assert.ok(validCatalog(decodeEntries(migrated, 'genshin'), 'genshin'));
});
