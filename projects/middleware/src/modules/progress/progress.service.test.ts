import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProgressService } from './progress.service';
import type { CatalogRepository, AccountProgressRepository } from '../../app/app.types';
import type { CatalogEntry, PlayerState } from '@lib/types/workspace.type';
import { emptyPatchOverview } from '@common/quests/story-template';

await test('progress rejects invalid payloads and stale revisions before catalog lookup or persistence', async () => {
    let reads = 0;
    let writes = 0;
    const catalog: CatalogRepository = {
        async read() { throw new Error('Catalog must not be read.'); },
        async write() { throw new Error('Catalog must not be written.'); },
        async parsed() { throw new Error('Parsed data must not be read.'); },
    };
    const progress: AccountProgressRepository = {
        async read() { reads++; return { revision: 2, state: {} }; },
        async patch() { writes++; return { revision: 3, state: {} }; },
    };
    const service = new ProgressService(catalog, progress);
    await assert.rejects(service.patch('alice', { revision: 2, changes: {}, account: 'bob' }), { status: 400 });
    assert.equal(reads, 0);
    await assert.rejects(service.patch('alice', { revision: 1, changes: {} }), { status: 409 });
    assert.equal(reads, 1);
    assert.equal(writes, 0);
});

await test('progress service retains the verified account ID and revision at the persistence boundary', async () => {
    let written = '';
    const catalog: CatalogRepository = {
        async read() { throw new Error('Empty changes need no catalog.'); },
        async write() { throw new Error('Progress must not write catalogs.'); },
        async parsed() { throw new Error('Progress must not read parsed data.'); },
    };
    const progress: AccountProgressRepository = {
        async read(user) { assert.equal(user, 'alice'); return { revision: 2, state: {} }; },
        async patch(user, revision, changes) {
            written = user;
            assert.equal(revision, 2);
            assert.deepEqual(changes, {});
            return { revision: 3, state: {} };
        },
    };
    assert.deepEqual(await new ProgressService(catalog, progress).patch('alice', { revision: 2, changes: {} }), { revision: 3, state: {} });
    assert.equal(written, 'alice');
});

await test('event aliases update one canonical progress record and bulk changes preserve optional objectives', async () => {
    const base = { game: 'genshin', notes: '', order: 0, category: '', rarity: 1, members: [], requirements: [], day: '' };
    const row = { content: 'Objective', contentType: '', patch: '', notes: '' };
    const event: CatalogEntry = { ...base, id: 'event', kind: 'events', name: 'Event', eventStory: { ...emptyPatchOverview(), rows: [{ ...row, id: 'one' }, { ...row, id: 'two' }, { ...row, id: 'bonus', optional: true }] } };
    const placement: CatalogEntry = { ...base, id: 'placement', kind: 'story', name: 'Event', category: 'events', eventId: event.id };
    let snapshot = { revision: 0, state: {} as Record<string, PlayerState> };
    const repository: CatalogRepository = {
        async read() {return { id: 'genshin', name: 'Genshin Impact', revision: 0, entries: [event, placement] };},
        async write() {throw new Error('Progress cannot change catalog.');}, async parsed() {return {};},
    };
    const progress: AccountProgressRepository = {
        async read(user) {assert.equal(user, 'alice'); return snapshot;},
        async patch(user, revision, changes) {assert.equal(user, 'alice'); assert.equal(revision, snapshot.revision); snapshot = { revision: revision + 1, state: { ...snapshot.state, ...changes } }; return snapshot;},
    };
    const service = new ProgressService(repository, progress);
    await service.patch('alice', { revision: 0, changes: { 'genshin/placement': { completed: false, quantity: 0, target: 0, storyRowCompletion: { one: true, bonus: true } } } });
    assert.deepEqual(Object.keys(snapshot.state), ['genshin/event']);
    assert.equal(snapshot.state['genshin/event'].completed, false);
    await service.patch('alice', { revision: 1, changes: { 'genshin/event': { completed: true, quantity: 0, target: 0 } } });
    assert.deepEqual(snapshot.state['genshin/event'].storyRowCompletion, { one: true, two: true, bonus: true });
    await service.patch('alice', { revision: 2, changes: { 'genshin/event': { completed: false, quantity: 0, target: 0 } } });
    assert.deepEqual(snapshot.state['genshin/event'].storyRowCompletion, { one: false, two: false, bonus: true });
    await assert.rejects(service.patch('alice', { revision: 3, changes: { 'genshin/event': { completed: true, quantity: 0, target: 0, storyRowCompletion: { forged: true } } } }), { status: 400 });
});
