import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configurationFields, documentConfiguration, flatGameDocument, storedGameId } from './game-configuration-document';
import { canAccessFeature, canAccessGame, defaultGameOverview, validGameOverview } from '@common/workspace/game-overview';

await test('legacy game configuration conversion preserves content, IDs, disabled features and version', () => {
    const old = { name: 'Original parser name', _gameId: 'genshin', _revision: 18, custom: { keep: true },
        _gameOverview: { ...defaultGameOverview('genshin'), genre: globalThis.undefined, gameType: 'RPG', visibility: globalThis.undefined, features: ['story'], archived: false },
        story: [{ id: 'guide', rows: [{ id: 'quest' }] }], characters: [{ id: 'character' }],
        version: { title: '1.10', url: 'https://example.com/version' } };
    const original = structuredClone(old);
    const converted = configurationFields(old, 'genshin');
    assert.equal(converted.gameConfiguration.genre, 'RPG');
    assert.deepEqual(converted.gameConfiguration.features, { story: { feature: 'story', visibility: 'public' } });
    assert.deepEqual(converted.content.story, old.story);
    assert.deepEqual(converted.content.characters, old.characters);
    assert.deepEqual(converted.version, old.version);
    assert.deepEqual(configurationFields({ ...old, ...converted }, 'genshin'), converted);
    assert.deepEqual(old, original);
    assert.deepEqual(flatGameDocument({ ...old, ...converted })['story'], old.story);
});

await test('game and feature access inherit restrictions without making shared definitions private', () => {
    const game = defaultGameOverview('genshin');
    game.features.story = { feature: 'story', visibility: 'editors' };
    assert.equal(validGameOverview(game), true);
    assert.equal(canAccessGame(game), true);
    assert.equal(canAccessFeature(game, 'story'), false);
    assert.equal(canAccessFeature(game, 'story', true), true);
    delete game.features.events;
    assert.equal(canAccessFeature(game, 'events', true), false);
    game.visibility = 'editors';
    assert.equal(canAccessFeature(game, 'characters'), false);
    assert.equal(canAccessFeature(game, 'characters', true), true);
    assert.equal(validGameOverview({ ...game, features: { story: { feature: 'events', visibility: 'public' } } }), false);
    assert.equal(validGameOverview({ ...game, features: { story: { feature: 'story', visibility: true } } }), false);
    assert.equal(validGameOverview({ ...game, features: { unsupported: { feature: 'unsupported', visibility: 'public' } } }), false);
});

await test('archived legacy records become editor workspaces, not deleted or archived games', () => {
    const game = documentConfiguration({ _gameOverview: { ...defaultGameOverview('genshin'), archived: true, features: [] } }, 'genshin');
    assert.equal(game.visibility, 'editors');
    assert.deepEqual(game.features, {});
    assert.equal('archived' in game, false);
    assert.throws(() => documentConfiguration({ gameConfiguration: { visibility: 'invalid' } }, 'genshin'));
});

await test('parser-only game identities and malformed content are handled without losing original data', () => {
    assert.equal(storedGameId({ name: 'Fate Grand Order' }), 'fgo');
    assert.equal(storedGameId({ name: 'Girls Frontline 2' }), 'gf2');
    assert.equal(storedGameId({ name: 'Honkai Star Rail' }), 'hsr');
    assert.equal(storedGameId({ name: 'Custom RPG', _gameOverview: { id: 'original-id' } }), 'original-id');
    assert.equal(configurationFields({ name: 'Fate Grand Order', events: [] }, 'fgo').gameConfiguration.name, 'Fate Grand Order');
    assert.throws(() => configurationFields({ content: { events: 'invalid' } }, 'genshin'));
    assert.throws(() => configurationFields({ content: [] }, 'genshin'));
});
