import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApi } from '../../app/server';
import type { Entry, GameSnapshot, PlayerState } from '@lib/types/workspace.type';
import type { ProgressSnapshot } from '@lib/types/player-progress.type';
import type { DashboardEvents, DashboardSummary } from '@lib/types/dashboard.type';
import { defaultGameOverview } from '@common/workspace/game-overview';
import { toCatalog } from '@common/workspace/workspace';
import { dashboardGame } from '@common/dashboard/dashboard-summary';
import { emptyCharacterCollection, emptyCharacterDefinition } from '@common/characters/characters';
import { editorFixture } from '../../tests/helpers/test-support';

const entry = (id: string, kind: Entry['kind'], extra: Partial<Entry> = {}): Entry => ({ id, kind, game: 'genshin', name: id, notes: '', category: '',
    completed: false, quantity: 0, target: 0, order: 0, rarity: 1, day: '', members: [], requirements: [], ...extra });
const snapshot = (): GameSnapshot => ({ id: 'genshin', name: 'Genshin Impact', revision: 0, overview: defaultGameOverview('genshin'), entries: [
    entry('region', 'story-category'), entry('quest', 'story', { storySection: 'region' }),
    entry('secret', 'characters'), entry('active', 'events', { startDate: '2020-01-01', endDate: '2099-01-01' }),
    entry('old', 'events', { startDate: '2020-01-01', endDate: '2020-02-01' }), entry('achievement', 'achievements'),
].map(toCatalog) });

await test('dashboard summary and event projections enforce scope, visibility and account isolation without exposing catalogs', async t => {
    const game = snapshot();
    game.overview!.features.characters!.visibility = 'editors';
    const hidden = { ...defaultGameOverview('hsr'), visibility: 'editors' as const };
    const state: Record<string, PlayerState> = { 'genshin/quest': { completed: true, quantity: 0, target: 0 } };
    const owners: string[] = [];
    const server = createApi({
        async list() {return [game.overview!, hidden];}, async read(id) {assert.equal(id, 'genshin'); return game;},
        async parsed() {return { version: { title: 'Version 6.2' } };}, async write() {throw new Error('Must never write shared data');},
    }, ['http://localhost:4200'], async () => true, globalThis.undefined, {
        ...editorFixture,
        async requireUser(request) {return { id: String(request.headers.authorization), name: 'Player', editor: false, csrf: '' };},
    }, {
        async read(owner): Promise<ProgressSnapshot> {owners.push(owner); return { revision: 0, state: owner === 'Bearer alice' ? state : {}, gameUpdatedAt: owner === 'Bearer alice' ? { genshin: '2026-11-26T16:00:00Z' } : {} };},
        async patch() {throw new Error('Projection must not write personal progress');},
    });
    await new Promise<void>(resolve => {server.listen(0, '127.0.0.1', resolve);});
    t.after(() => {server.closeAllConnections(); server.close();});
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/dashboard/`;
    const request = async (path: string, body: unknown, authorization?: string) => fetch(base + path, { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body) });
    const aliceResponse = await request('summary', { state: {} }, 'Bearer alice');
    assert.equal(aliceResponse.status, 200);
    const alice = await aliceResponse.json() as DashboardSummary;
    assert.equal(alice.games.length, 1);
    assert.deepEqual(alice.games[0].story && { completed: alice.games[0].story.completed, total: alice.games[0].story.total }, { completed: 1, total: 1 });
    assert.equal(alice.games[0].characters, globalThis.undefined);
    assert.equal(alice.games[0].version, 'Version 6.2');
    assert.equal(alice.games[0].progressUpdatedAt, '2026-11-26T16:00:00Z');
    assert.equal(JSON.stringify(alice).includes('"entries"'), false);
    const bob = await (await request('summary/genshin', { state }, 'Bearer bob')).json() as DashboardSummary;
    assert.equal(bob.games[0].story?.completed, 0, 'request data must never impersonate signed-in account progress');
    assert.equal(bob.games[0].progressUpdatedAt, globalThis.undefined);
    const guest = await (await request('summary', { state })).json() as DashboardSummary;
    assert.equal(guest.games[0].story?.completed, 1, 'guest projection uses device state without persisting it');
    assert.deepEqual(owners, ['Bearer alice', 'Bearer bob']);
    assert.equal((await request('summary/hsr', {})).status, 404);
    assert.equal((await request('summary', { state: 'bad' })).status, 400);
    const events = await (await request('events/genshin', {})).json() as DashboardEvents;
    assert.deepEqual(events.entries.map(item => item.id), ['active']);
    assert.equal(events.entries.some(item => item.kind !== 'events'), false);
    game.overview!.features.events!.visibility = 'editors';
    assert.deepEqual((await (await request('events', {})).json() as DashboardEvents).entries, []);
});

await test('permanent activity objectives remain story progress and character goals are personal', () => {
    const game = snapshot();
    const activity = entry('challenge', 'story', { category: 'endgame-activity', storySection: 'region', storyContent: {
        imageUrl: '', imageAlt: '', sourceName: '', sourceUrl: '', groups: [], rows: [{ id: 'objective', contentType: 'text', content: 'First clear', patch: '1.0', notes: '' }],
    } });
    game.entries.push(toCatalog(activity));
    const value = dashboardGame(game, { 'genshin/challenge': { completed: false, quantity: 0, target: 0, storyRowCompletion: { objective: true } } }, true);
    assert.equal(value.activities?.[0].id, 'challenge');
    assert.equal(value.activities?.[0].total, 1);
    assert.equal(value.activities?.[0].completed, 1);
    assert.equal(value.planCount, 0);
});

await test('game dashboard projections aggregate shared material needs and prioritize configured character goals and achievement categories', () => {
    const game = snapshot();
    game.entries.push(...[
        entry('currency', 'inventory'),
        entry('plan-a', 'plans', { requirements: [{ item: 'currency', amount: 6 }] }),
        entry('plan-b', 'plans', { requirements: [{ item: 'currency', amount: 6 }] }),
        entry('no-need', 'inventory'),
        entry('hero', 'characters', { icon: '/splash.webp', characterDefinition: { ...emptyCharacterDefinition(), headshot: '/headshot.webp' } }),
        entry('another', 'characters', { characterDefinition: emptyCharacterDefinition() }),
        entry('progress-category', 'achievement-category', { name: 'In progress' }),
        entry('category-a', 'achievements', { category: 'progress-category' }),
        entry('category-b', 'achievements', { category: 'progress-category' }),
    ].map(toCatalog));
    const collection = { ...emptyCharacterCollection(), owned: true, level: 10, target: { level: 50, gear: {}, progression: {} } };
    const value = dashboardGame(game, {
        'genshin/currency': { completed: false, quantity: 8, target: 0 },
        'genshin/plan-a': { completed: false, quantity: 0, target: 1 },
        'genshin/plan-b': { completed: false, quantity: 0, target: 1 },
        'genshin/hero': { completed: false, quantity: 0, target: 0, characterCollection: collection },
        'genshin/another': { completed: false, quantity: 0, target: 0, characterCollection: { ...emptyCharacterCollection(), owned: true } },
        'genshin/category-a': { completed: true, quantity: 0, target: 0 },
    }, true);
    assert.deepEqual(value.materials, { sufficient: 0, partial: 1, missing: 0 }, 'eight units cannot satisfy two six-unit plans; unused materials are excluded');
    assert.equal(value.characters?.entries[0].id, 'hero');
    assert.equal(value.characters?.entries[0].icon, '/headshot.webp');
    assert.equal(value.characters?.entries[0].hasGoal, true);
    assert.equal(value.plans?.find(plan => plan.id === 'hero')?.target, 'Level 10 to 50');
    assert.equal(value.achievementCategories?.[0].name, 'In progress');
    assert.equal(value.achievementCategories?.[0].completed, 1);
});

await test('current patch links match version metadata rather than pointing at a later configured patch', () => {
    const game = snapshot();
    const template = { imageUrl: '', imageAlt: '', sourceName: '', sourceUrl: '', rows: [] };
    game.entries.push(toCatalog(entry('current-patch', 'story', { category: 'patch-overview', patchOverview: { ...template, patchVersion: '1.0' } })),
        toCatalog(entry('future-patch', 'story', { category: 'patch-overview', order: 10, patchOverview: { ...template, patchVersion: '1.1' } })));
    assert.equal(dashboardGame(game, {}, false, globalThis.undefined, '1').patch?.id, 'current-patch');
    assert.equal(dashboardGame(game, {}, false, globalThis.undefined, '2').patch, globalThis.undefined);
});
