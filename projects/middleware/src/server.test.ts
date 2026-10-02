import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { createApi } from './server';
import { ApiError } from './repository';
import { CatalogEntry, GameSnapshot, GAMES, validCatalog } from '../../common/workspace';

test('API validation, revision conflicts, origin checks, and parsed-data reads', async (t) => {
    const state = new Map(
        GAMES.map((game) => [
            game.id,
            { id: game.id, name: game.name, revision: 0, entries: [] } as GameSnapshot,
        ]),
    );
    const server = createApi(
        {
            async read(id) {
                return state.get(id)!;
            },
            async parsed() {
                return { version: { title: 'Parser version' }, Event: [{ title: 'Parser event' }] };
            },
            async write(id, entries, revision) {
                if (state.get(id)!.revision !== revision) {
                    throw new ApiError(409, 'Stale revision');
                }
                const value = { ...state.get(id)!, entries, revision: revision + 1 };
                state.set(id, value);
                return value;
            },
        },
        ['http://127.0.0.1:4200'],
        async () => true,
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    t.after(
        () =>
            new Promise<void>((resolve) => {
                server.close(() => resolve());
                server.closeAllConnections();
            }),
    );
    const category: CatalogEntry = {
        id: 'category',
        game: 'genshin',
        kind: 'achievement-category',
        name: 'Exploration',
        notes: '',
        category: '',
        rarity: 0,
        members: [],
        requirements: [],
        order: 0,
        day: 'Any day',
    };
    const put = (body: unknown, headers: Record<string, string> = {}) =>
        fetch(`${base}/api/games/genshin/catalog`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body),
        });
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/games/unknown`)).status, 404);
    assert.equal((await put({ revision: 0, entries: [category] })).status, 200);
    assert.equal((await put({ revision: 0, entries: [category] })).status, 409);
    assert.equal(
        (await put({ revision: 1, entries: [{ ...category, completed: true }] })).status,
        400,
    );
    assert.equal(
        (await put({ revision: 1, entries: [{ ...category, quantity: 100 }] })).status,
        400,
    );
    assert.equal((await put({ revision: 1, entries: [{ ...category, game: 'zzz' }] })).status, 400);
    assert.equal(
        (await put({ revision: 1, entries: [category] }, { Origin: 'https://unrelated.example' }))
            .status,
        403,
    );
    assert.equal(
        (await put({ revision: 1, entries: [category] }, { 'Content-Type': 'text/plain' })).status,
        415,
    );
    const malformed = await fetch(`${base}/api/games/genshin/catalog`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{broken',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await (await fetch(`${base}/api/games/genshin/parsed`)).json(), {
        version: { title: 'Parser version' },
        Event: [{ title: 'Parser event' }],
    });
    assert.equal(
        validCatalog([{ ...category, kind: 'achievements', category: 'missing' }], 'genshin'),
        false,
    );
    assert.equal(
        validCatalog(
            [category, { ...category, id: 'a', kind: 'achievements', category: 'category' }],
            'genshin',
        ),
        true,
    );
});
