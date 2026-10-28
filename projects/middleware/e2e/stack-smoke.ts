import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { createServer, request as proxyRequest, type Server } from 'node:http';
import { mkdtemp, readFile, readdir, rm, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, relative, isAbsolute } from 'node:path';
import { MongoClient } from 'mongodb';
import puppeteer, { type Browser, type BrowserContext, type Page } from 'puppeteer';
import { Auth0Security } from '../src/auth0';
import { GameRepository } from '../src/repository';
import { ProgressRepository, type ProgressDocument } from '../src/progress';
import { createApi } from '../src/server';
import { GAMES, type CatalogEntry } from '../../common/workspace';
import { emptyPatchOverview } from '../../common/story-template';
import { AUTH0_PUBLIC } from './auth0-config';

// Do not load .env: never inherit the application's database name, assets, or tenant.
const databaseName = `game_guides_e2e_${randomUUID().replaceAll('-', '')}`;
const client = new MongoClient(process.env['E2E_MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 5000 });
const temporary = await mkdtemp(join(tmpdir(), 'game-guides-e2e-'));
const assets = join(temporary, 'uploads');
const artifacts = resolve('tmp/e2e-artifacts');
const build = resolve('dist/guides-app-e2e/browser');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const issuer = `https://${AUTH0_PUBLIC.domain}/`;
let browser: Browser | undefined;
let apiServer: Server | undefined;
let apiOrigin = '';
let origin = '';
let databaseConnected = false;
const pages: Page[] = [];
const runtimeErrors: string[] = [];
const externalRequests: string[] = [];

async function listen(server: Server): Promise<string> {
    await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    return `http://127.0.0.1:${address.port}`;
}

async function close(server?: Server): Promise<void> {
    if (!server?.listening) return;
    server.closeIdleConnections();
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
}

function jwt(subject: string, overrides: Record<string, unknown> = {}): string {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ iss: issuer, aud: AUTH0_PUBLIC.audience, sub: subject,
        azp: AUTH0_PUBLIC.clientId, name: subject, iat: now, exp: now + 3600, ...overrides })).toString('base64url');
    const content = `${header}.${body}`;
    return `${content}.${sign('sha256', Buffer.from(content), privateKey).toString('base64url')}`;
}

const editorToken = jwt('e2e-editor');
const playerToken = jwt('e2e-player');
async function api(path: string, token?: string, method = 'GET', body?: unknown): Promise<Response> {
    return fetch(origin + path, {
        method,
        headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10000),
    });
}

// Serve the real Angular build, proxying API calls to the real createApi server.
// This seed page exists only in this harness, never in the production server.
const uiServer = createServer((req, res) => {
    if (req.url?.startsWith('/api/')) {
        const proxied = proxyRequest(apiOrigin + req.url, { method: req.method, headers: req.headers }, upstream => {
            res.writeHead(upstream.statusCode ?? 502, upstream.headers);
            upstream.pipe(res);
        });
        proxied.on('error', () => { res.writeHead(502); res.end(); });
        req.pipe(proxied);
        return;
    }
    void (async () => {
        if (req.url === '/__e2e/session') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>E2E session setup</title>'); return; }
        const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
        const candidate = resolve(build, '.' + pathname);
        const path = relative(build, candidate);
        if (path.startsWith('..') || isAbsolute(path)) { res.writeHead(403); res.end(); return; }
        const file = await stat(candidate).then(value => value.isFile() ? candidate : join(build, 'index.html')).catch(() => join(build, 'index.html'));
        const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
        res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        res.end(await readFile(file));
    })().catch(() => { res.writeHead(500); res.end('E2E static server failed'); });
});

async function newPage(subject?: string): Promise<{ page: Page; context: BrowserContext }> {
    assert.ok(browser);
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    pages.push(page);
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => runtimeErrors.push(String(error)));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setRequestInterception(true);
    page.on('request', request => {
        const url = new URL(request.url());
        if (url.origin === issuer.slice(0, -1) && ['/v2/logout', '/oidc/logout'].includes(url.pathname)) {
            // Exercise SDK logout/cache clearing; replace only the remote provider redirect.
            void request.respond({ status: 302, headers: { location: origin + '/' } });
        } else if (url.origin === origin || ['data:', 'blob:', 'about:'].includes(url.protocol)) {
            void request.continue();
        } else {
            externalRequests.push(url.origin + url.pathname);
            void request.abort();
        }
    });
    if (subject) {
        await page.goto(origin + '/__e2e/session');
        const accessToken = jwt(subject);
        const idToken = jwt(subject, { aud: AUTH0_PUBLIC.clientId });
        // Pre-authenticated fixture only: login redirects/Google/MFA/refresh rotation require a provider suite.
        // The actual Angular SDK obtains this token; the API still validates its signature and claims.
        await page.evaluate(({ config, subject, accessToken, idToken, issuer }) => {
            const scope = 'openid profile email offline_access';
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            const decodedToken = { user: { sub: subject, name: subject }, claims: { sub: subject, name: subject, iss: issuer, aud: config.clientId, exp: expiresAt, __raw: idToken } };
            localStorage.setItem(`@@auth0spajs@@::${config.clientId}::${config.audience}::${scope}`, JSON.stringify({
                body: { client_id: config.clientId, audience: config.audience, scope, access_token: accessToken, id_token: idToken, decodedToken, expires_in: 3600, token_type: 'Bearer' }, expiresAt,
            }));
            localStorage.setItem(`@@auth0spajs@@::${config.clientId}::@@user@@`, JSON.stringify({ id_token: idToken, decodedToken }));
            document.cookie = `auth0.${config.clientId}.is.authenticated=true; path=/; SameSite=Lax`;
        }, { config: AUTH0_PUBLIC, subject, accessToken, idToken, issuer });
    }
    return { page, context };
}

const checkbox = '#story-row-e2e-quest-e2e-row input[type=checkbox]';
async function openStory(page: Page): Promise<void> {
    await page.goto(origin + '/games/genshin/story', { waitUntil: 'networkidle0' });
    await page.waitForSelector(checkbox);
}
async function checked(page: Page, expected: boolean): Promise<void> {
    await page.waitForFunction((selector, value) => (document.querySelector(selector) as HTMLInputElement)?.checked === value, {}, checkbox, expected);
}
async function clickButton(page: Page, label: string, scope = 'gg-story'): Promise<void> {
    await page.$$eval(`${scope} button`, (buttons, label) => {
        const button = buttons.find(item => item.textContent?.trim() === label && (item as HTMLElement).offsetParent !== null) as HTMLButtonElement | undefined;
        if (!button) throw new Error(`Missing button: ${label}`);
        button.click();
    }, label);
}

try {
    await readFile(join(build, 'index.html')); // Fail before connecting if the E2E build is missing.
    await mkdir(artifacts, { recursive: true });
    await client.connect();
    databaseConnected = true;
    const db = client.db(databaseName);
    const collection = db.collection('games');
    const repository = new GameRepository(collection, db.collection('games_schema_v1_backup'));
    await repository.initialize();
    assert.equal(await collection.countDocuments(), GAMES.length);
    assert.equal(await db.collection('games_schema_v1_backup').countDocuments(), GAMES.length);
    const progress = new ProgressRepository(db.collection<ProgressDocument>('games_player_progress'));
    origin = await listen(uiServer);
    // Generated key injection is confined to this entry point. Production main.ts is unchanged.
    const security = new Auth0Security({ ...AUTH0_PUBLIC, origin, editors: ['e2e-editor'] }, publicKey.export({ type: 'spki', format: 'pem' }).toString());
    apiServer = createApi(repository, [origin], () => db.command({ ping: 1 }), assets, security, progress);
    apiOrigin = await listen(apiServer);

    const baseEntry = { game: 'genshin', notes: '', order: 0, category: '', rarity: 0, members: [], requirements: [], day: '' };
    const entries: CatalogEntry[] = [
        { ...baseEntry, id: 'e2e-section', kind: 'story-category', name: 'E2E Chapter' },
        { ...baseEntry, id: 'e2e-quest', kind: 'story', name: 'E2E Main Quest', category: 'main-story', storySection: 'e2e-section',
            mainStory: { ...emptyPatchOverview(), groups: [{ id: 'quest-group', title: 'E2E Quest Group' }], rows: [
                { id: 'e2e-row', groupId: 'quest-group', content: 'E2E Objective', contentUrl: 'https://example.invalid/quest', contentType: '', patch: '1.0', notes: 'E2E notes' },
            ] } },
    ];
    const snapshot = await (await api('/api/games/genshin')).json();
    const update = (token: string | undefined, revision = snapshot.revision, data = entries) => api('/api/games/genshin/catalog', token, 'PUT', { revision, entries: data });
    assert.equal((await update(undefined)).status, 401);
    assert.equal((await update(playerToken)).status, 403);
    for (const claims of [{ aud: 'wrong' }, { iss: 'https://wrong.invalid/' }, { exp: 1 }, { azp: 'wrong' }]) {
        assert.equal((await api('/api/auth/session', jwt('e2e-editor', claims))).status, 401);
    }
    const parts = editorToken.split('.');
    parts[2] = (parts[2]!.startsWith('A') ? 'B' : 'A') + parts[2]!.slice(1);
    assert.equal((await api('/api/auth/session', parts.join('.'))).status, 401);
    const seeded = await update(editorToken);
    assert.equal(seeded.status, 200, await seeded.text());
    console.log('PASS API authentication: real RS256 validation, guest denial, editor allowlist, invalid claims/signature denial.');

    browser = await puppeteer.launch({ headless: true, userDataDir: join(temporary, 'browser-profile') });
    const { page: guest } = await newPage();
    await openStory(guest);
    assert.equal(await guest.$('gg-story .story-mode-toggle'), null);
    await checked(guest, false);
    await guest.click(checkbox);
    await checked(guest, true);
    await guest.reload({ waitUntil: 'networkidle0' });
    await checked(guest, true);
    assert.equal(await db.collection('games_player_progress').countDocuments(), 0);
    console.log('PASS guest completion persists locally without shared catalog or account writes.');

    const { page: editor, context: editorContext } = await newPage('e2e-editor');
    await openStory(editor);
    await editor.waitForSelector('gg-story .story-mode-toggle');
    await checked(editor, false);
    const revisionBeforeCompletion = (await repository.read('genshin')).revision;
    const saved = editor.waitForResponse(response => response.url().endsWith('/api/me/progress') && response.request().method() === 'PATCH');
    await editor.click(checkbox);
    assert.equal((await saved).status(), 200);
    await checked(editor, true);
    await editor.reload({ waitUntil: 'networkidle0' });
    await checked(editor, true);
    assert.equal((await repository.read('genshin')).revision, revisionBeforeCompletion);
    assert.equal((await (await api('/api/me/progress', editorToken)).json()).state['genshin/e2e-quest'].storyRowCompletion['e2e-row'], true);
    const { page: sameAccount, context: restoredContext } = await newPage('e2e-editor');
    await openStory(sameAccount);
    await checked(sameAccount, true);
    assert.equal(await sameAccount.evaluate(() => localStorage.getItem('gg-player-v1')), null);
    const { page: player } = await newPage('e2e-player');
    await openStory(player);
    await checked(player, false);
    assert.equal(await player.$('gg-story .story-mode-toggle'), null);
    assert.deepEqual((await (await api('/api/me/progress', playerToken)).json()).state, {});
    await restoredContext.close();
    console.log('PASS editor UI authorization, saved account completion, fresh-browser restoration, player/account isolation.');

    // Exercise the UI editor and upload via the browser's real SDK-attached bearer token.
    await editor.click('gg-story .story-mode-toggle');
    await editor.waitForSelector('gg-story .story-mode-toggle[aria-checked=true]');
    await clickButton(editor, 'Edit');
    await editor.waitForSelector('gg-story [role=dialog] input[name=title]');
    await editor.$eval('gg-story [role=dialog] input[name=title]', element => {
        const input = element as HTMLInputElement;
        input.value = 'E2E Edited Quest';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const imagePath = join(temporary, 'e2e-pixel.png');
    const { writeFile } = await import('node:fs/promises');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHHsAAAAASUVORK5CYII=', 'base64');
    await writeFile(imagePath, png);
    const upload = editor.waitForResponse(response => /\/api\/games\/genshin\/images/.test(response.url()) && response.request().method() === 'POST');
    const fileInput = await editor.$('gg-story [role=dialog] gg-game-image-picker input[type=file]');
    assert.ok(fileInput);
    await fileInput.uploadFile(imagePath);
    const uploaded = await upload;
    assert.equal(uploaded.status(), 201);
    const image = (await (await api('/api/games/genshin/images')).json()).images.find((item: { name: string }) => item.name.startsWith('e2e-pixel-'));
    assert.ok(image);
    assert.ok(image.url.startsWith('/api/games/genshin/images/'));
    const download = await api(image.url);
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
    const save = editor.waitForResponse(response => response.url().endsWith('/api/games/genshin/catalog') && response.request().method() === 'PUT');
    await clickButton(editor, 'Save changes');
    assert.equal((await save).status(), 200);
    await editor.waitForSelector('gg-story [role=dialog]', { hidden: true });
    await guest.reload({ waitUntil: 'networkidle0' });
    await guest.waitForFunction(() => document.querySelector('gg-story')?.textContent?.includes('E2E Edited Quest'));
    await editor.reload({ waitUntil: 'networkidle0' });
    await checked(editor, true);
    assert.equal((await repository.read('genshin')).entries.find(entry => entry.id === 'e2e-quest')?.mainStory?.imageUrl, image.url);
    assert.equal((await api('/api/games/genshin/images', playerToken, 'POST')).status, 403);
    console.log('PASS shared UI edits, browser upload, image persistence/download, and upload permission denial.');

    // Simultaneous writers must produce exactly one commit and one conflict.
    const current = await repository.read('genshin');
    const conflicts = await Promise.all([update(editorToken, current.revision, current.entries), update(editorToken, current.revision, current.entries)]);
    assert.deepEqual(conflicts.map(response => response.status).sort(), [200, 409]);
    const state = await (await api('/api/me/progress', editorToken)).json();
    const progressConflicts = await Promise.all([0, 1].map(() => api('/api/me/progress', editorToken, 'PATCH', { revision: state.revision, changes: state.state })));
    assert.deepEqual(progressConflicts.map(response => response.status).sort(), [200, 409]);
    console.log('PASS concurrent catalog and account progress writes reject stale revisions.');

    await editor.click('[popovertarget=profile-menu]');
    await Promise.all([
        editor.waitForNavigation({ waitUntil: 'networkidle0' }),
        clickButton(editor, 'Sign out', 'gg-account-menu'),
    ]);
    await openStory(editor);
    await checked(editor, false);
    assert.equal(await editor.$('gg-story .story-mode-toggle'), null);
    assert.equal(await editor.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('@@auth0spajs@@'))), false);
    assert.equal((await api('/api/me/progress')).status, 401);
    assert.equal((await api('/api/me/progress', editorToken)).status, 200, 'Logout clears browser credentials; an issued JWT remains valid until expiry.');
    await editorContext.close();
    assert.deepEqual(runtimeErrors, []);
    assert.deepEqual(externalRequests, []);
    assert.ok((await readdir(join(assets, 'genshin-impact'))).length > 0);
    console.log('PASS SDK logout clears browser credentials; issued bearer tokens are not globally revoked.');
    console.log('Browser integration checks passed.');
} catch (error) {
    await mkdir(artifacts, { recursive: true });
    for (const [index, page] of pages.entries()) {
        if (!page.isClosed()) await page.screenshot({ path: join(artifacts, `failure-${index}.png`), fullPage: true }).catch(() => {});
    }
    throw error;
} finally {
    // Stop all writers before cleanup; cleanup failures must fail the run as well.
    const results = await Promise.allSettled([browser?.close(), close(apiServer), close(uiServer)]);
    try {
        assert.match(databaseName, /^game_guides_e2e_[a-f0-9]{32}$/);
        if (databaseConnected) {
            const db = client.db(databaseName);
            await db.dropDatabase();
            assert.equal((await db.listCollections().toArray()).length, 0, 'Disposable catalog, backups and account progress must all be removed.');
        }
        const ownedPath = relative(tmpdir(), temporary);
        assert.ok(!isAbsolute(ownedPath) && !ownedPath.startsWith('..') && /^game-guides-e2e-[^/\\]+$/.test(ownedPath));
        await rm(temporary, { recursive: true });
        console.log('PASS cleanup: disposable database and all temporary uploads/browser profiles removed.');
    } finally { await client.close(); }
    const failures = results.filter(result => result.status === 'rejected');
    assert.equal(failures.length, 0, 'Browser/API/static servers must close cleanly.');
}
