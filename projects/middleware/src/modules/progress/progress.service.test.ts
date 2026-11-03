import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProgressService } from './progress.service';
import type { CatalogRepository, AccountProgressRepository } from '../../app/app.types';

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
