import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configurationFields, documentConfiguration, flatGameDocument, storedGameId } from './game-configuration-document';
import { canAccessFeature, canAccessGame, defaultGameOverview, validGameOverview } from '@common/workspace/game-overview';

await test('legacy game configuration conversion preserves content, IDs, disabled features and version', () => {
    const old = { name: 'Original parser name', _gameId: 'genshin', _revision: 18, custom: { keep: true },
        _gameOverview: { ...defaultGameOverview('genshin'), genres: globalThis.undefined, gameType: 'RPG', visibility: globalThis.undefined, features: ['story'], archived: false },
        story: [{ id: 'guide', rows: [{ id: 'quest' }] }], characters: [{ id: 'character' }],
        version: { title: '1.10', url: 'https://example.com/version' } };
    const original = structuredClone(old);
    const converted = configurationFields(old, 'genshin');
    const registration = documentConfiguration(converted, 'genshin');
    assert.equal(registration.gameId, 'genshin');
    assert.equal('id' in registration, false);
    assert.equal('gameId' in converted.gameConfiguration, false);
    assert.deepEqual(converted.gameConfiguration.genres, ['RPG']);
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

await test('stored genre conversion combines classifications and removes aliases without changing content or revision', () => {
    const {gameId,...configuration}=defaultGameOverview('genshin');
    const stored={gameId,gameConfiguration:{...configuration,revision:7,genre:'RPG',genres:['Action RPG','RPG'],searchAliases:['Teyvat']},content:{story:[{id:'keep'}]}};
    const original=structuredClone(stored);
    const converted=configurationFields(stored,gameId);
    assert.deepEqual(converted.gameConfiguration.genres,['Action RPG','RPG']);
    assert.equal(converted.gameConfiguration.revision,7);
    assert.equal('genre' in converted.gameConfiguration,false);
    assert.equal('searchAliases' in converted.gameConfiguration,false);
    assert.deepEqual(converted.content,stored.content);
    assert.deepEqual(configurationFields({...stored,...converted},gameId),converted);
    assert.deepEqual(stored,original);
    const {genres:_genres,...previous}=configuration;
    assert.deepEqual(documentConfiguration({gameConfiguration:{...previous,genre:'JRPG'}},gameId).genres,['JRPG']);
    assert.throws(()=>documentConfiguration({gameConfiguration:{...configuration,genres:null}},gameId));
});

await test('game genre validation accepts empty or multiple classifications and rejects retired fields', () => {
    const game=defaultGameOverview('genshin');
    assert.equal(validGameOverview(game),true);
    assert.equal(validGameOverview({...game,genres:['RPG','Open World']}),true);
    for(const genres of ['RPG',null,[''],['RPG','RPG'],[42],['x'.repeat(81)]]) {
        assert.equal(validGameOverview({...game,genres}),false);
    }
    assert.equal(validGameOverview({...game,genre:'RPG'}),false);
    assert.equal(validGameOverview({...game,searchAliases:['Teyvat']}),false);
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
