import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GamesService } from './games.service';
import { ApiError } from '../../core/errors/app-error';
import type { CatalogRepository } from '../../app/app.types';

test('catalog validation rejects malformed rules before persistence and retains revision conflicts', async () => {
    let writes = 0;
    const repository: CatalogRepository = {
        async read() { throw new Error('Read is not used here.'); },
        async parsed() { throw new Error('Parsed data is not used here.'); },
        async write(id, entries, revision) {
            writes++;
            assert.equal(id, 'genshin');
            assert.deepEqual(entries, []);
            assert.equal(revision, 4);
            throw new ApiError(409, 'Game changed.');
        },
    };
    const service = new GamesService(repository);
    await assert.rejects(service.write('genshin', { revision: 4, entries: [], characterRules: {} }), { status: 400 });
    assert.equal(writes, 0);
    await assert.rejects(service.write('genshin', { revision: 4, entries: [] }), { status: 409 });
    assert.equal(writes, 1);
});
