import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Collection, Document } from 'mongodb';
import type { CatalogEntry, GameSnapshot } from '../../../../lib/types/workspace.type';
import type { CharacterRules } from '../../../../lib/types/character.type';
import { createApi } from '../../app/server';
import { defaultGameOverview } from '../../../../common/workspace/game-overview';
import { emptyCharacterDefinition } from '../../../../common/characters/characters';
import { GameRepository } from '../games/games.repository';
import { ApiError } from '../../core/errors/app-error';

const character: CatalogEntry = { id: 'alice', game: 'genshin', kind: 'characters', name: 'Alice', rarity: 5, notes: '', category: '', order: 0, day: '', members: [], requirements: [], characterDefinition: emptyCharacterDefinition() };
const rules: CharacterRules = { levelCap: 100, rarities: [5], weaponTypes: [], damageTypes: [], roles: [], equipmentSlots: [], progressionTracks: [], progressionProfiles: [{ id: 'standard', gameId: 'genshin', tracks: [{ id: 'level', label: 'Level', type: 'level', minValue: 1, maxValue: 100, displayOrder: 0 }] }] };

await test('public character projections paginate and filter shared data without reading account state', async t => {
    let snapshot: GameSnapshot = { id: 'genshin', name: 'Game', revision: 3, entries: [character, { ...character, id: 'bob', name: 'Bob' }], characterRules: rules, overview: defaultGameOverview('genshin') };
    const server = createApi({ async read(id) {if (id !== 'genshin') {throw new ApiError(404, 'Unknown game');} return structuredClone(snapshot);}, async write() {throw new Error('Read API cannot write');}, async parsed() {return {};} }, ['http://localhost:4200'], async () => true);
    await new Promise<void>(done => {server.listen(0, '127.0.0.1', done);});
    t.after(() => new Promise<void>(done => {server.close(() => done()); server.closeAllConnections();}));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const request = (path: string) => fetch(base + path);
    const page = await (await request('/api/games/genshin/characters?offset=1&limit=1')).json() as { total: number; characters: { id: string }[] };
    assert.equal(page.total, 2); assert.equal(page.characters[0].id, 'bob');
    const found = await (await request('/api/games/genshin/characters?search=ali&rarity=5')).json() as { total: number };
    assert.equal(found.total, 1);
    const detail = await (await request('/api/games/genshin/characters/alice')).json() as { character: Record<string, unknown> };
    assert.equal(detail.character['gameId'], 'genshin'); assert.equal('characterCollection' in detail.character, false);
    assert.equal('owned' in detail.character, false); assert.equal('progression' in detail.character, false);
    assert.equal((await request('/api/games/genshin/character-progression/standard')).status, 200);
    assert.equal((await request('/api/games/genshin/character-progression/missing')).status, 404);
    assert.equal((await request('/api/games/genshin/characters/missing')).status, 404);
    assert.equal((await request('/api/games/unknown/characters')).status, 404);
    for (const query of ['limit=201', 'offset=-1', 'limit=1.2', 'rarity=invalid', 'unknown=1']) {assert.equal((await request('/api/games/genshin/characters?' + query)).status, 400);}
    assert.equal((await fetch(base + '/api/games/genshin/characters', { method: 'POST', headers: { Origin: 'http://localhost:4200' } })).status, 405);
    snapshot = { ...snapshot, overview: { ...snapshot.overview!, features: [] } };
    assert.equal((await request('/api/games/genshin/characters')).status, 404);
    assert.equal((await request('/api/games/genshin/character-progression')).status, 404);
});
await test('profile and resource definitions persist in the existing game document and reject cross-game or missing references', async () => {
    let document: Record<string, unknown> = { _id: 'game', name: 'Genshin Impact', _revision: 0, _schemaVersion: 2, characters: [character], story: [], inventory: [], events: [], plans: [], teams: [], achievements: [] };
    const collection = { findOne: async () => structuredClone(document), updateOne: async (filter: Document, update: Document) => {
        if (filter['_revision'] !== document['_revision']) {return { matchedCount: 0 };}
        document = { ...document, ...update['$set'] as Record<string, unknown> }; return { matchedCount: 1 };
    } } as unknown as Collection<Document>;
    const repository = new GameRepository(collection, collection);
    const shared = { ...character, characterDefinition: { ...emptyCharacterDefinition(), progressionProfileId: 'standard', schemaVersion: 2 as const, resources: [{ id: 'guide', title: 'Guide', category: 'build-guides', sourceType: 'external' as const, url: 'https://example.com/guide', creator: 'Author', sortOrder: 2 }] } };
    await repository.write('genshin', [shared], 0, rules);
    const restored = await repository.read('genshin');
    assert.deepEqual(restored.characterRules, rules); assert.deepEqual(restored.entries[0].characterDefinition, shared.characterDefinition);
    assert.equal('characterCollection' in restored.entries[0], false);
    const foreign = { ...rules, progressionProfiles: [{ ...rules.progressionProfiles![0], gameId: 'hsr' }] };
    await assert.rejects(repository.write('genshin', [shared], 1, foreign), { status: 400 });
    const missingCost = structuredClone(rules); missingCost.progressionProfiles![0].tracks[0].upgradeCosts = [{ fromValue: 1, toValue: 2, materials: [{ itemId: 'missing', quantity: 1 }] }];
    await assert.rejects(repository.write('genshin', [shared], 1, missingCost), { status: 400 });
    assert.equal((await repository.read('genshin')).revision, 1);
    const narrowed = structuredClone(rules); narrowed.progressionProfiles![0].tracks[0].maxValue = 50;
    await assert.rejects(repository.write('genshin', [shared], 1, narrowed), error => error instanceof ApiError && error.status === 400 && error.message.includes('migration'));
    const renamed = structuredClone(rules); renamed.progressionProfiles![0].tracks[0].label = 'Character level';
    renamed.description = 'Editor configuration'; renamed.configurationVersion = '1.6';
    await repository.write('genshin', [shared], 1, renamed);
    assert.deepEqual((await repository.read('genshin')).characterRules, renamed);
});
