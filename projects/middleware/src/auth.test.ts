import * as oidc from 'openid-client';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { Collection, Document } from 'mongodb';
import { AuthService, LoginDocument, SessionDocument, safeReturnTo } from './auth';
import { ProgressDocument, ProgressRepository } from './progress';
import { createApi } from './server';
import { validProgressState } from '../../common/player-progress';
import { CatalogEntry } from '../../common/workspace';
import { StoryTrackingMode } from '../../common/enums/story-tracking.enum';

function memory<T extends Document>() {
    const docs = new Map<string, T>();
    const match = (doc: T, query: Record<string, unknown>) =>
        Object.entries(query).every(([key, value]) =>
            value && typeof value === 'object' && '$gt' in value
                ? doc[key] > value.$gt!
                : doc[key] === value,
        );
    const collection = {
        async createIndex() {},
        async findOne(query: Record<string, unknown>) {
            const doc = [...docs.values()].find((doc) => match(doc, query));
            return doc ? structuredClone(doc) : null;
        },
        async insertOne(doc: T) {
            if (docs.has(String(doc['_id'])))
                throw Object.assign(new Error('Duplicate'), { code: 11000 });
            docs.set(String(doc['_id']), structuredClone(doc));
        },
        async updateOne(
            query: Record<string, unknown>,
            update: { $set?: Partial<T>; $inc?: Record<string, number> },
        ) {
            const doc = [...docs.values()].find((doc) => match(doc, query));
            if (!doc) return { matchedCount: 0 };
            Object.assign(doc, update.$set);
            for (const [key, value] of Object.entries(update.$inc ?? {}))
                (doc as Document)[key] += value;
            return { matchedCount: 1 };
        },
        async deleteOne(query: Record<string, unknown>) {
            const doc = [...docs.values()].find((doc) => match(doc, query));
            if (doc) docs.delete(String(doc['_id']));
        },
        async findOneAndDelete(query: Record<string, unknown>) {
            const doc = await collection.findOne(query);
            if (doc) docs.delete(String(doc['_id']));
            return doc;
        },
    };
    return { docs, collection: collection as unknown as Collection<T> };
}
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const origin = 'https://guides.example';
const playerState = { completed: true, quantity: 0, target: 0, storyRowCompletion: { row: true } };
const request = (cookie: string, csrf?: string, source = origin) =>
    ({
        headers: { cookie, origin: source, ...(csrf ? { 'x-csrf-token': csrf } : {}) },
    }) as unknown as IncomingMessage;
function setup() {
    const sessions = memory<SessionDocument>();
    const logins = memory<LoginDocument>();
    const auth = new AuthService(
        {
            origin,
            issuer: 'https://issuer.example',
            clientId: 'client',
            clientSecret: 'secret',
            editors: ['editor-subject'],
        },
        sessions.collection,
        logins.collection,
    );
    const add = (raw: string, user: string, subject = 'player') =>
        sessions.docs.set(hash(raw), {
            _id: hash(raw),
            user,
            subject,
            name: user,
            csrf: 'c'.repeat(43),
            expiresAt: new Date(Date.now() + 60000),
            idleAt: new Date(Date.now() + 60000),
        });
    return { auth, sessions, logins, add };
}

test('sessions enforce expiry, opaque cookie identity, origin, CSRF and editor permissions', async () => {
    const { auth, sessions, add } = setup();
    const raw = 'a'.repeat(43);
    add(raw, 'alice');
    const cookie = '__Host-gg-session=' + raw;
    assert.equal((await auth.requireUser(request(cookie))).id, 'alice');
    await assert.rejects(auth.requireUser(request(''), true), { status: 401 });
    await assert.rejects(auth.requireUser(request(cookie), true), { status: 403 });
    await assert.rejects(
        auth.requireUser(request(cookie, 'c'.repeat(43), 'https://evil.example'), true),
        { status: 403 },
    );
    await assert.rejects(auth.requireUser(request(cookie, '?'.repeat(43)), true), { status: 403 });
    await assert.rejects(auth.requireEditor(request(cookie, 'c'.repeat(43))), { status: 403 });
    add(raw, 'alice', 'editor-subject');
    assert.equal((await auth.requireEditor(request(cookie, 'c'.repeat(43)))).editor, true);
    sessions.docs.get(hash(raw))!.idleAt = new Date(0);
    await assert.rejects(auth.requireUser(request(cookie)), { status: 401 });
    add(raw, 'alice');
    sessions.docs.get(hash(raw))!.expiresAt = new Date(0);
    await assert.rejects(auth.requireUser(request(cookie)), { status: 401 });
    await assert.rejects(auth.requireUser(request(cookie + '; ' + cookie)), { status: 401 });
});

test('logout revokes the server session and expires the secure HttpOnly cookie', async () => {
    const { auth, sessions, add } = setup();
    const raw = 'a'.repeat(43);
    add(raw, 'alice');
    const headers = new Map<string, unknown>();
    const response = {
        setHeader(key: string, value: unknown) {
            headers.set(key, value);
        },
        getHeader(key: string) {
            return headers.get(key);
        },
        writeHead() {},
        end() {},
    } as unknown as ServerResponse;
    const req = request('__Host-gg-session=' + raw, 'c'.repeat(43));
    req.method = 'POST';
    await auth.handle(req, response, new URL(origin + '/api/auth/logout'));
    assert.equal(sessions.docs.size, 0);
    assert.match(String(headers.get('Set-Cookie')), /HttpOnly; SameSite=Lax; Max-Age=0; Secure/);
    await assert.rejects(auth.requireUser(req), { status: 401 });
});

test('login redirects stay on this site and progress rejects arbitrary fields and unsafe keys', () => {
    for (const path of [
        '//evil.example',
        '/\\evil.example',
        'https://evil.example',
        '/api/auth/login',
        '/a\nb',
    ])
        assert.equal(safeReturnTo(path), '/dashboard');
    assert.equal(
        safeReturnTo('/genshin/story/inazuma?view=guide#row'),
        '/genshin/story/inazuma?view=guide#row',
    );
    assert.equal(validProgressState({ 'genshin/quest': playerState }), true);
    assert.equal(validProgressState({ 'genshin/quest': { ...playerState, userId: 'bob' } }), false);
    assert.equal(validProgressState({ 'genshin/$set': playerState }), false);
    assert.equal(validProgressState({ 'unknown/quest': playerState }), false);
});

test('progress repository isolates accounts and rejects stale revisions including racing first writes', async () => {
    const db = memory<ProgressDocument>();
    const progress = new ProgressRepository(db.collection);
    await progress.patch('alice', 0, { 'genshin/quest': playerState });
    assert.deepEqual(await progress.read('bob'), { revision: 0, state: {} });
    await assert.rejects(progress.patch('alice', 0, {}), { status: 409 });
    const results = await Promise.allSettled([
        progress.patch('bob', 0, {}),
        progress.patch('bob', 0, {}),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await progress.read('alice')).state['genshin/quest'].completed, true);
});

test('HTTP API denies anonymous edits, isolates progress, validates references and rejects CSRF', async (t) => {
    const { auth, add } = setup();
    add('a'.repeat(43), 'alice');
    add('b'.repeat(43), 'bob');
    const db = memory<ProgressDocument>();
    const progress = new ProgressRepository(db.collection);
    const entry: CatalogEntry = {
        id: 'quest',
        game: 'genshin',
        kind: 'story',
        category: 'lore',
        name: 'Quest',
        notes: '',
        order: 0,
        rarity: 0,
        members: [],
        requirements: [],
        day: '',
        lore: {
            imageUrl: '',
            imageAlt: '',
            sourceName: '',
            sourceUrl: '',
            rows: [{ id: 'row', contentType: '', content: 'Row', patch: '', notes: '' }],
        },
    };
    const repository = {
        async read(id: string) {
            return { id, name: id, revision: 0, entries: [entry] };
        },
        async write() {
            throw new Error('Must not write');
        },
        async parsed() {
            return {};
        },
    };
    const server = createApi(repository, [origin], async () => true, undefined, auth, progress);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(
        () =>
            new Promise<void>((resolve) => {
                server.close(() => resolve());
                server.closeAllConnections();
            }),
    );
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    const headers = {
        Cookie: '__Host-gg-session=' + 'a'.repeat(43),
        Origin: origin,
        'X-CSRF-Token': 'c'.repeat(43),
        'Content-Type': 'application/json',
    };
    const patch = (changes: unknown, extra = {}, revision = 0) =>
        fetch(base + '/api/me/progress', {
            method: 'PATCH',
            headers: { ...headers, ...extra },
            body: JSON.stringify({ revision, changes }),
        });
    assert.equal((await fetch(base + '/api/games')).status, 200);
    assert.equal((await fetch(base + '/api/me/progress')).status, 401);
    assert.equal((await fetch(base + '/api/games/genshin/catalog', { method: 'PUT' })).status, 401);
    assert.equal((await fetch(base + '/api/games/genshin/images', { method: 'POST' })).status, 401);
    assert.equal(
        (await fetch(base + '/api/games/genshin/catalog', { method: 'PUT', headers })).status,
        403,
    );
    assert.equal(
        (await patch({ 'genshin/quest': playerState }, { 'X-CSRF-Token': '' })).status,
        403,
    );
    assert.equal((await patch({ 'genshin/missing': playerState })).status, 400);
    assert.equal(
        (await patch({ 'genshin/quest': { ...playerState, storyRowCompletion: { fake: true } } }))
            .status,
        400,
    );
    assert.equal((await patch({ 'genshin/quest': playerState })).status, 200);
    assert.equal((await patch({ 'genshin/quest': playerState })).status, 409);
    const bob = await fetch(base + '/api/me/progress', {
        headers: { Cookie: '__Host-gg-session=' + 'b'.repeat(43) },
    });
    assert.deepEqual(await bob.json(), { revision: 0, state: {} });
    const forged = await fetch(base + '/api/me/progress', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ revision: 1, userId: 'bob', changes: {} }),
    });
    assert.equal(forged.status, 400);
    const history = { 'archived-parent': true, 'removed-row': false, 'cycle:season-1:row': true };
    await progress.patch('alice', 1, { 'genshin/quest': { ...playerState, storyRowCompletion: { ...history, row: true } } });
    const edited = { ...playerState, storyRowCompletion: { ...history, row: false } };
    const historySave = await patch({ 'genshin/quest': edited }, {}, 2);
    assert.equal(historySave.status, 200, JSON.stringify(await historySave.json()));
    assert.deepEqual((await progress.read('alice')).state['genshin/quest'].storyRowCompletion, edited.storyRowCompletion);
    assert.equal((await patch({ 'genshin/quest': { ...edited, storyRowCompletion: { ...edited.storyRowCompletion, fake: true } } }, {}, 3)).status, 400);
    assert.equal((await patch({ 'genshin/quest': { ...edited, storyRowCompletion: { ...edited.storyRowCompletion, 'removed-row': true } } }, {}, 3)).status, 400);
    assert.equal((await patch({ 'genshin/quest': edited }, { Cookie: '__Host-gg-session=' + 'b'.repeat(43) }, 0)).status, 400);
    entry.lore!.context = { trackingMode: StoryTrackingMode.Recurring, cycleId: 'season-2' };
    const recurring = { ...edited, storyRowCompletion: { ...edited.storyRowCompletion, 'cycle:season-2:row': true } };
    assert.equal((await patch({ 'genshin/quest': recurring }, {}, 3)).status, 200);
    assert.equal((await progress.read('alice')).state['genshin/quest'].storyRowCompletion?.['cycle:season-1:row'], true);
    assert.equal((await patch({ 'genshin/quest': { ...recurring, storyRowCompletion: { ...recurring.storyRowCompletion, 'cycle:future:row': true } } }, {}, 4)).status, 400);
});

test('unconfigured authentication fails closed while public catalogs remain readable', async (t) => {
    const server = createApi(
        {
            async read(id) {
                return { id, name: id, revision: 0, entries: [] };
            },
            async write() {
                throw new Error('Must not write');
            },
            async parsed() {
                return {};
            },
        },
        [origin],
        async () => true,
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(
        () =>
            new Promise<void>((resolve) => {
                server.close(() => resolve());
                server.closeAllConnections();
            }),
    );
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    assert.equal((await fetch(base + '/api/games')).status, 200);
    assert.equal((await fetch(base + '/api/games/genshin/catalog', { method: 'PUT' })).status, 401);
    assert.deepEqual(await (await fetch(base + '/api/auth/session')).json(), {
        configured: false,
        user: null,
        csrf: null,
    });
});

test('OIDC code flow binds state, nonce and PKCE, rotates sessions and consumes login flows once', async () => {
    const { auth, sessions, logins, add } = setup();
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const key = {
        ...publicKey.export({ format: 'jwk' }),
        kid: 'test-key',
        alg: 'RS256',
        use: 'sig',
    };
    const configuration = new oidc.Configuration(
        {
            issuer: 'https://issuer.example',
            authorization_endpoint: 'https://issuer.example/authorize',
            token_endpoint: 'https://issuer.example/token',
            jwks_uri: 'https://issuer.example/jwks',
            id_token_signing_alg_values_supported: ['RS256'],
        },
        'client',
        'secret',
    );
    oidc.enableNonRepudiationChecks(configuration);
    let nonce = '';
    let verifier = '';
    let wrongNonce = false;
    let invalidToken = false;
    configuration[oidc.customFetch] = async (input, options) => {
        const path = String(input);
        if (path.endsWith('/jwks')) return Response.json({ keys: [key] });
        assert.ok(path.endsWith('/token'));
        const body = new URLSearchParams(String(options?.body));
        assert.equal(body.get('code_verifier'), verifier);
        const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString(
            'base64url',
        );
        const claims = Buffer.from(
            JSON.stringify({
                iss: 'https://issuer.example',
                aud: 'client',
                sub: 'player',
                name: 'Alice',
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 300,
                nonce: wrongNonce ? 'wrong' : nonce,
            }),
        ).toString('base64url');
        const content = header + '.' + claims;
        return Response.json({
            token_type: 'Bearer',
            access_token: 'unused-server-token',
            id_token:
                content +
                '.' +
                sign(
                    'sha256',
                    Buffer.from(invalidToken ? content + 'tampered' : content),
                    privateKey,
                ).toString('base64url'),
        });
    };
    Object.assign(auth, { discovery: Promise.resolve(configuration) });
    const capture = () => {
        const headers = new Map<string, unknown>();
        let status = 200;
        const response = {
            setHeader(key: string, value: unknown) {
                headers.set(key, value);
            },
            getHeader(key: string) {
                return headers.get(key);
            },
            writeHead(code: number, values: Record<string, unknown> = {}) {
                status = code;
                for (const [key, value] of Object.entries(values)) headers.set(key, value);
            },
            end() {},
        } as unknown as ServerResponse;
        return { headers, response, status: () => status };
    };
    const login = async () => {
        const result = capture();
        const req = request('');
        req.method = 'GET';
        await auth.handle(
            req,
            result.response,
            new URL(origin + '/api/auth/login?returnTo=%2Fgenshin%2Fstory%2Finazuma'),
        );
        const url = new URL(String(result.headers.get('Location')));
        assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
        assert.equal(url.searchParams.get('scope'), 'openid profile');
        nonce = url.searchParams.get('nonce')!;
        const cookie = (result.headers.get('Set-Cookie') as string[])[0].split(';')[0];
        const flow = [...logins.docs.values()][0];
        verifier = flow.verifier;
        assert.equal(
            url.searchParams.get('code_challenge'),
            await oidc.calculatePKCECodeChallenge(verifier),
        );
        return { cookie, state: url.searchParams.get('state')! };
    };
    const old = 'o'.repeat(43);
    add(old, 'old-user');
    const flow = await login();
    const result = capture();
    const req = request(flow.cookie + '; __Host-gg-session=' + old);
    req.method = 'GET';
    const callback = new URL(origin + '/api/auth/callback?code=test&state=' + flow.state);
    await auth.handle(req, result.response, callback);
    assert.equal(result.status(), 303);
    assert.equal(result.headers.get('Location'), '/genshin/story/inazuma');
    assert.equal(sessions.docs.has(hash(old)), false);
    assert.equal(sessions.docs.size, 1);
    assert.equal(logins.docs.size, 0);
    assert.ok(!JSON.stringify([...sessions.docs.values()]).includes('unused-server-token'));
    const cookie = (result.headers.get('Set-Cookie') as string[]).find((value) =>
        value.startsWith('__Host-gg-session='),
    )!;
    assert.match(cookie, /HttpOnly; SameSite=Lax; Max-Age=86400; Secure/);
    await assert.rejects(auth.handle(req, capture().response, callback), { status: 400 });
    const badState = await login();
    const badReq = request(badState.cookie);
    badReq.method = 'GET';
    await assert.rejects(
        auth.handle(
            badReq,
            capture().response,
            new URL(origin + '/api/auth/callback?code=test&state=wrong'),
        ),
        { status: 400 },
    );
    wrongNonce = true;
    const badNonce = await login();
    const nonceReq = request(badNonce.cookie);
    nonceReq.method = 'GET';
    await assert.rejects(
        auth.handle(
            nonceReq,
            capture().response,
            new URL(origin + '/api/auth/callback?code=test&state=' + badNonce.state),
        ),
        { status: 400 },
    );
    wrongNonce = false;
    invalidToken = true;
    const badSignature = await login();
    const signatureReq = request(badSignature.cookie);
    signatureReq.method = 'GET';
    await assert.rejects(
        auth.handle(
            signatureReq,
            capture().response,
            new URL(origin + '/api/auth/callback?code=test&state=' + badSignature.state),
        ),
        { status: 400 },
    );
    assert.equal(sessions.docs.size, 1);
});
