import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { createApi } from "../../app/server";
import { editorFixture } from "../../tests/helpers/test-support";
import type { CatalogEntry, PlayerState } from "../../../../lib/types/workspace.type";
import { fromCatalog, toCatalog, validCatalog } from "../../../../common/workspace/workspace";
import { decodeEntries, encodeEntries } from "../documents/game-document";

const item: CatalogEntry = {
    id: 'book',
    game: 'genshin',
    kind: 'inventory',
    name: 'Talent book',
    notes: '',
    category: 'Talent',
    region: 'Mondstadt',
    maxStack: 100,
    icon: 'https://example.com/book.png',
    rarity: 3,
    members: [],
    requirements: [],
    order: 0,
    day: '',
};

await test('inventory metadata round trips while quantities remain personal', () => {
    assert.equal(validCatalog([item], 'genshin'), true);
    assert.deepEqual(decodeEntries(encodeEntries([item]), 'genshin'), [item]);
    assert.deepEqual(
        toCatalog(fromCatalog(item, { completed: false, quantity: 24, target: 0 })),
        item,
    );
    assert.equal(validCatalog([{ ...item, maxStack: 0 }], 'genshin'), false);
    assert.equal(validCatalog([{ ...item, maxStack: 1.5 }], 'genshin'), false);
});

await test('inventory API rejects fractional and excessive quantities and writes valid quantities as progress', async (t) => {
    let progress: { revision: number; state: Record<string, PlayerState> } = {
        revision: 0,
        state: {},
    };
    const server = createApi(
        {
            async read(id) {
                return { id, name: id, revision: 0, entries: [item] };
            },
            async parsed() {
                return {};
            },
            async write() {
                throw new Error('Quantity updates must not write catalogs');
            },
        },
        ['http://localhost:4200'],
        async () => true,
        '',
        {
            ...editorFixture,
            async requireUser() {
                return { id: 'player', name: 'Player', editor: false, csrf: '' };
            },
        },
        {
            async read() {
                return structuredClone(progress);
            },
            async patch(_user, revision, changes) {
                progress = { revision: revision + 1, state: { ...progress.state, ...changes } };
                return structuredClone(progress);
            },
        },
    );
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    t.after(
        () =>
            new Promise<void>((resolve) => {
                server.close(() => resolve());
                server.closeAllConnections();
            }),
    );
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const patch = (quantity: number) =>
        fetch(base + '/api/me/progress', {
            method: 'PATCH',
            headers: { Origin: 'http://localhost:4200', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                revision: 0,
                changes: { 'genshin/book': { completed: false, quantity, target: 0 } },
            }),
        });
    for (const quantity of [-1, 0.5, 101]) {assert.equal((await patch(quantity)).status, 400);}
    assert.equal(progress.revision, 0);
    assert.equal((await patch(24)).status, 200);
    assert.equal(progress.state['genshin/book'].quantity, 24);
});
