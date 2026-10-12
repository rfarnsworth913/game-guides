import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AddressInfo } from 'node:net';
import { createApi } from './server';

test('game image uploads persist, list per game, serve immediately and reject unsafe input', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'guides-images-'));
    const server = createApi({
        async read() { throw new Error('Unexpected database call'); },
        async write() { throw new Error('Unexpected database call'); },
        async parsed() { throw new Error('Unexpected database call'); },
    }, ['http://localhost:4200'], async () => true, root);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); });
        await rm(root, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const endpoint = `${base}/api/games/endfield/images`;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6uAAAAAASUVORK5CYII=', 'base64');
    const upload = (body: Buffer | string = png, type = 'image/png', origin?: string) => fetch(`${endpoint}?name=${encodeURIComponent('../../Patch Artwork.png')}`, {
        method: 'POST', headers: { 'Content-Type': type, ...(origin ? { Origin: origin } : {}) }, body: typeof body === 'string' ? body : new Uint8Array(body),
    });
    assert.deepEqual(await (await fetch(endpoint)).json(), { images: [] });
    const response = await upload();
    assert.equal(response.status, 201);
    const image = await response.json() as { name: string; url: string };
    assert.match(image.name, /^patch-artwork-[a-f0-9-]+\.png$/);
    assert.deepEqual(await readFile(join(root, 'arknights-endfield', image.name)), png);
    const served = await fetch(`${base}${image.url}`);
    assert.equal(served.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), png);
    assert.deepEqual(await (await fetch(endpoint)).json(), { images: [image] });
    assert.deepEqual(await (await fetch(`${base}/api/games/genshin/images`)).json(), { images: [] });
    assert.equal((await fetch(`${base}/api/games/genshin/images/${image.name}`)).status, 404);
    assert.notEqual((await (await upload()).json()).name, image.name);
    assert.equal((await upload('<svg></svg>', 'image/svg+xml')).status, 415);
    assert.equal((await upload('<script>bad</script>')).status, 415);
    const mislabeled = await upload(png, 'image/jpeg');
    assert.equal(mislabeled.status, 201);
    const detected = await mislabeled.json() as { name: string; url: string };
    assert.match(detected.name, /\.png$/);
    assert.equal((await fetch(`${base}${detected.url}`)).headers.get('content-type'), 'image/png');
    assert.equal((await upload(Buffer.alloc(10 * 1024 * 1024 + 1))).status, 413);
    assert.equal((await upload(png, 'image/png', 'https://unrelated.example')).status, 403);
    assert.equal((await fetch(`${base}/api/games/unknown/images`)).status, 404);
    assert.equal((await fetch(`${endpoint}/%2e%2e%5csecret.png`)).status, 404);
});
