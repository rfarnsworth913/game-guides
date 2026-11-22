import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId, type Collection, type Document } from 'mongodb';
import { GameRepository, gameDocumentName } from './games.repository';
import { defaultGameOverview, gameOverviewErrors, normalizeGameColor, validGameOverview } from '@common/workspace/game-overview';
import { GAMES } from '@lib/constants/workspace.constants';
import { createApi } from '../../app/server';
import { editorFixture } from '../../tests/helpers/test-support';
import { ApiError } from '../../core/errors/app-error';
import type { AddressInfo } from 'node:net';

function registryRepository() {
    const documents: Document[] = GAMES.map(game => ({ _id: new ObjectId(), name: gameDocumentName(game.id), _gameId: game.id,
        _gameOverview: defaultGameOverview(game.id), _revision: 0, _schemaVersion: 2,
        story: [], characters: [], events: [], inventory: [], plans: [], teams: [], achievements: [] }));
    function matches(document: Document, filter: Document): boolean {
        return Object.entries(filter as Record<string, unknown>).every(([key, expected]) => {
            const value = key.split('.').reduce<unknown>((current, part) => current && typeof current === 'object' ? (current as Document)[part] : globalThis.undefined, document);
            if (expected && typeof expected === 'object' && '$ne' in expected) {return value !== expected.$ne;}
            if (expected && typeof expected === 'object' && '$type' in expected) {return typeof value === expected.$type;}
            return value instanceof ObjectId && expected instanceof ObjectId ? value.equals(expected) : value === expected;
        });
    }
    const collection = {
        find: (filter: Document) => ({ toArray: async () => structuredClone(documents.filter(document => matches(document, filter))) }),
        findOne: async (filter: Document) => documents.find(document => matches(document, filter)) ?? null,
        insertOne: async (document: Document) => {documents.push({ ...document, _id: new ObjectId() });},
        updateOne: async (filter: Document, update: Document) => {
            const document = documents.find(item => matches(item, filter));
            if (!document) {return { matchedCount: 0 };}
            Object.assign(document, update['$set']);
            return { matchedCount: 1 };
        },
    } as unknown as Collection<Document>;
    return { repository: new GameRepository(collection, collection), documents };
}

await test('game overviews validate IDs, images, feature flags and bounded metadata', () => {
    const game = defaultGameOverview('new-rpg');
    assert.equal(validGameOverview(game), true);
    for (const bad of [{ id: '../bad' }, { id: 'constructor' }, { name: ' ' }, { features: ['unsupported'] },
        { features: ['story', 'story'] }, { icon: 'data:text/html,unsafe' }, { banner: '/private/file' },
        { color: 'url(https://example.com)' }, { extra: 'not allowed' }, { revision: -1 }]) {
        assert.equal(validGameOverview({ ...game, ...bad }), false);
    }
    assert.equal(validGameOverview({ ...game, icon: '/api/games/new-rpg/images/icon-a123.png', features: [] }), true);
});
await test('highlight colors accept opaque RGB only and persist normalized without changing game identity', async () => {
    const { repository } = registryRepository();
    const game = defaultGameOverview('genshin');
    assert.equal(normalizeGameColor('#12abEF'), 'rgba(18, 171, 239, 1)');
    assert.equal(normalizeGameColor('rgb(1, 2, 3)'), 'rgba(1, 2, 3, 1)');
    for (const color of ['rgba(1, 2, 3, .5)', 'rgba(1, 2, 3)', 'rgb(1, 2, 3, 1)', 'rgb(256, 0, 0)', 'var(--untrusted)', 'red; color: black', 'url(https://example.com)']) {
        assert.ok(gameOverviewErrors({ ...game, color }).color);
        await assert.rejects(repository.saveOverview({ ...game, color }), { status: 400 });
    }
    const saved = await repository.saveOverview({ ...game, color: '#12abEF' });
    assert.equal(saved.color, 'rgba(18, 171, 239, 1)');
    assert.equal((await repository.read('genshin')).overview?.color, saved.color);
});

await test('renaming and archiving games preserve parser document names and shared catalog data', async () => {
    const { repository, documents } = registryRepository();
    const original = documents.find(document => document['_gameId'] === 'genshin')!;
    original['inventory'] = [{ id: 'material', kind: 'inventory', game: 'genshin', name: 'Material', category: '', notes: '',
        rarity: 1, order: 0, day: '', members: [], requirements: [] }];
    const before = await repository.read('genshin');
    const edited = await repository.saveOverview({ ...before.overview!, name: 'A new display title', features: ['inventory'] });
    assert.equal((await repository.read('genshin')).name, 'A new display title');
    assert.equal(original['name'], 'Genshin Impact');
    assert.deepEqual((await repository.read('genshin')).entries, before.entries);
    assert.equal((await repository.read('genshin')).revision, before.revision);
    await assert.rejects(repository.saveOverview(before.overview!), { status: 409 });
    const archived = await repository.archive('genshin', edited.revision);
    assert.equal((await repository.list()).some(game => game.id === 'genshin'), false);
    assert.equal((await repository.list(true)).some(game => game.id === 'genshin'), true);
    await assert.rejects(repository.read('genshin'), { status: 404 });
    await repository.saveOverview({ ...archived, archived: false });
    assert.deepEqual((await repository.read('genshin')).entries, before.entries);
    assert.equal(documents.length, GAMES.length);
});

await test('custom games support catalog writes and keep stable IDs across overview edits', async () => {
    const { repository } = registryRepository();
    const game = await repository.saveOverview({ ...defaultGameOverview('custom-rpg'), name: 'Custom RPG', features: ['events'] }, true);
    await assert.rejects(repository.saveOverview(game, true), { status: 409 });
    const entry = { id: 'event', game: game.id, kind: 'events' as const, name: 'New event', category: '', notes: '', rarity: 1,
        order: 0, day: '', members: [], requirements: [] };
    await repository.write(game.id, [entry], 0);
    await repository.saveOverview({ ...game, name: 'Renamed RPG', features: [] });
    assert.equal((await repository.read(game.id)).entries[0].id, 'event');
    assert.equal((await repository.read(game.id)).name, 'Renamed RPG');
});

await test('game management endpoints reject guests and players and require current overview revisions', async t => {
    const { repository } = registryRepository();
    const security = { ...editorFixture, async requireUser(request: import('node:http').IncomingMessage) {
        if (!request.headers['x-test-role']) {throw new ApiError(401, 'Authentication required.');}
        return { ...await editorFixture.requireUser(request), editor: request.headers['x-test-role'] === 'editor' };
    }, async requireEditor(request: import('node:http').IncomingMessage) {
        if (request.headers['x-test-role'] !== 'editor') {throw new ApiError(request.headers['x-test-role'] ? 403 : 401, 'Editor required.');}
        return editorFixture.requireEditor(request);
    } };
    const server = createApi(repository, ['http://localhost:4200'], async () => true, globalThis.undefined, security);
    await new Promise<void>(resolve => {server.listen(0, '127.0.0.1', resolve);});
    t.after(() => new Promise<void>(resolve => {server.close(() => resolve()); server.closeAllConnections();}));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const game = defaultGameOverview('new-game');
    const request = (path: string, method: string, role?: string, body?: unknown) => fetch(base + path, {
        method, headers: { 'Content-Type': 'application/json', ...(role ? { 'x-test-role': role } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    for (const role of [globalThis.undefined, 'player']) {
        for (const [path, method, body] of [['/api/games', 'POST', game], ['/api/games/genshin/overview', 'PUT', defaultGameOverview('genshin')], ['/api/games/genshin', 'DELETE', { revision: 0 }]] as const) {
            assert.equal((await request(path, method, role, body)).status, role ? 403 : 401);
        }
        assert.equal((await request('/api/games/registry', 'GET', role)).status, role ? 403 : 401);
    }
    assert.equal((await request('/api/games', 'POST', 'editor', game)).status, 201);
    assert.equal((await request('/api/games/new-game/overview', 'PUT', 'editor', { ...game, id: 'wrong-game' })).status, 400);
    assert.equal((await request('/api/games/new-game', 'DELETE', 'editor', { revision: 0 })).status, 200);
    assert.equal((await request('/api/games/new-game/overview', 'PUT', 'editor', game)).status, 409);
    assert.equal((await request('/api/games/new-game', 'GET')).status, 404);
});
