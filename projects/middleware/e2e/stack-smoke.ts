import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, request as proxyRequest, type Server } from 'node:http';
import { mkdtemp, readFile, readdir, rm, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, relative, isAbsolute } from 'node:path';
import { MongoClient } from 'mongodb';
import puppeteer, { type Browser, type BrowserContext, type Page } from 'puppeteer';
import { Auth0Security } from '../src/core/auth/providers/auth0.provider';
import { GameRepository } from "../src/modules/games/games.repository";
import { ProgressRepository, type ProgressDocument } from "../src/modules/progress/progress.repository";
import { createApi } from "../src/app/server";
import { GAMES } from '../../lib/constants/workspace.constants';
import type { CatalogEntry } from '../../lib/types/workspace.type';
import { emptyPatchOverview } from '../../common/quests/story-template';
import { AUTH0_PUBLIC } from './auth0-config';
import { defaultGameOverview } from '../../common/workspace/game-overview';

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
let bootstrap: ChildProcess | undefined;
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

async function stopBootstrap(): Promise<void> {
    if (!bootstrap) return;
    if (bootstrap.exitCode !== null) { assert.equal(bootstrap.exitCode, 0); return; }
    const child = bootstrap;
    const stopped = new Promise<void>((done, reject) => {
        const timeout = setTimeout(() => { child.kill(); reject(new Error('Application bootstrap did not stop cleanly.')); }, 5000);
        child.once('exit', code => { clearTimeout(timeout); code === 0 ? done() : reject(new Error('Application bootstrap failed.')); });
    });
    child.send('shutdown');
    await stopped;
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

async function newPage(subject?: string, invalidRefresh = false): Promise<{ page: Page; context: BrowserContext }> {
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
        if (invalidRefresh && url.origin === issuer.slice(0, -1) && url.pathname === '/oauth/token') {
            // Fixture only: reproduce a permanently invalid refresh token without contacting a real tenant.
            void request.respond({ status: request.method() === 'OPTIONS' ? 204 : 403,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': request.headers()['access-control-request-headers'] ?? 'content-type, auth0-client' },
                ...(request.method() === 'OPTIONS' ? {} : { body: JSON.stringify({ error: 'invalid_grant', error_description: 'Unknown or invalid refresh token.' }) }) });
        } else if (url.origin === issuer.slice(0, -1) && ['/v2/logout', '/oidc/logout'].includes(url.pathname)) {
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
        await page.evaluate(({ config, subject, accessToken, idToken, issuer, invalidRefresh }) => {
            const scope = 'openid profile email offline_access';
            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            const decodedToken = { user: { sub: subject, name: subject }, claims: { sub: subject, name: subject, iss: issuer, aud: config.clientId, exp: expiresAt, __raw: idToken } };
            localStorage.setItem(`@@auth0spajs@@::${config.clientId}::${config.audience}::${scope}`, JSON.stringify({
                body: { client_id: config.clientId, audience: config.audience, scope, access_token: accessToken, id_token: idToken, decodedToken, expires_in: 3600, token_type: 'Bearer', ...(invalidRefresh ? { refresh_token: 'e2e-invalid-refresh-token' } : {}) },
                expiresAt: invalidRefresh ? Math.floor(Date.now() / 1000) - 60 : expiresAt,
            }));
            localStorage.setItem(`@@auth0spajs@@::${config.clientId}::@@user@@`, JSON.stringify({ id_token: idToken, decodedToken }));
            document.cookie = `auth0.${config.clientId}.is.authenticated=true; path=/; SameSite=Lax`;
        }, { config: AUTH0_PUBLIC, subject, accessToken, idToken, issuer, invalidRefresh });
    }
    return { page, context };
}

const checkbox = '#story-row-e2e-quest-e2e-row input[type=checkbox]';
const activeEditSwitch = 'gg-story .story-header-expanded:not([inert]) .story-mode-toggle, gg-story .compact-story-toolbar.visible .story-mode-toggle';
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

    // Exercise the real startup entry separately, with the same disposable database.
    // Public health requires no provider call, tenant credentials or auth bypass.
    const portProbe = createServer();
    const bootstrapOrigin = await listen(portProbe);
    await close(portProbe);
    bootstrap = spawn(process.execPath, ['--import', 'tsx', 'projects/middleware/src/app/app.ts'], {
        env: { ...process.env, NODE_ENV: 'test', DB_CONN_STRING: process.env['E2E_MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017',
            DB_NAME: databaseName, DB_COLLECTION: 'games', MIDDLEWARE_PORT: new URL(bootstrapOrigin).port, APP_ORIGIN: origin },
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let startupLog = '';
    bootstrap.stdout?.on('data', chunk => { startupLog = (startupLog + String(chunk)).slice(-2000); });
    bootstrap.stderr?.on('data', chunk => { startupLog = (startupLog + String(chunk)).slice(-2000); });
    let startupReady = false;
    for (let attempt = 0; attempt < 40; attempt++) {
        if (bootstrap.exitCode !== null) break;
        try { startupReady = (await fetch(bootstrapOrigin + '/api/health', { signal: AbortSignal.timeout(500) })).ok; }
        catch { /* wait for the real application entry to connect */ }
        if (startupReady) break;
        await new Promise(done => setTimeout(done, 150));
    }
    assert.ok(startupReady, 'Application bootstrap did not start: ' + startupLog);
    await stopBootstrap();
    bootstrap = undefined;
    console.log('PASS real application startup, MongoDB connectivity and graceful shutdown.');

    const baseEntry = { game: 'genshin', notes: '', order: 0, category: '', rarity: 0, members: [], requirements: [], day: '' };
    const entries: CatalogEntry[] = [
        { ...baseEntry, id: 'e2e-section', kind: 'story-category', name: 'E2E Chapter' },
        { ...baseEntry, id: 'e2e-quest', kind: 'story', name: 'E2E Main Quest', category: 'main-story', storySection: 'e2e-section',
            mainStory: { ...emptyPatchOverview(), context: { region: 'Original region', area: 'Original area', chain: 'Original chain', chapter: 'Original act', cycleId: 'original-cycle', resetSchedule: 'Weekly' }, groups: [{ id: 'quest-group', title: 'E2E Quest Group' }], rows: [
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
    await editor.click(activeEditSwitch);
    await editor.waitForSelector('gg-story .story-mode-toggle[aria-checked=true]');
    await clickButton(editor, 'Edit');
    await editor.waitForSelector('gg-story [role=dialog] input[name=title]');
    const workspace = 'gg-story [role=dialog] .section-editor-workspace';
    const editorLayout = await editor.$eval(workspace, element => {
        const sidebar = element.querySelector('.section-editor-sidebar')!.getBoundingClientRect();
        const pane = element.querySelector('.section-editor-main')!.getBoundingClientRect();
        const dialog = element.closest('[role=dialog]')!.getBoundingClientRect();
        return { sidebarLeft: sidebar.left, sidebarRight: sidebar.right, paneLeft: pane.left, paneWidth: pane.width, dialogLeft: dialog.left };
    });
    assert.ok(editorLayout.sidebarLeft >= editorLayout.dialogLeft && editorLayout.paneLeft >= editorLayout.sidebarRight - 1 && editorLayout.paneWidth > 400, 'Editor panes must stay inside the dialog and use separate columns.');
    const beforeGroupEdits = await repository.read('genshin');
    await editor.click(`${workspace} [data-editor-group="quest-group"] .editor-group-link`);
    const rowEditor = `${workspace} [data-story-editor-row="e2e-row"]`;
    await editor.click(`${rowEditor} [aria-label="Edit E2E Objective"]`);
    await editor.waitForSelector(`${rowEditor} .compact-row-fields`, { visible: true });
    assert.equal(await editor.$$eval(`${rowEditor} .context-panel-toggle`, buttons => buttons.every(button => button.getAttribute('aria-expanded') === 'false')), true);
    await editor.click(`${rowEditor} .context-panel-toggle`);
    await editor.waitForSelector(`${rowEditor} .context-panel-body.expanded`);
    await editor.$eval(`${workspace} .section-editor-main`, element => { element.scrollTop = 0; });
    await editor.screenshot({ path: join(artifacts, 'content-group-details-desktop.png') });
    await editor.setViewport({ width: 390, height: 844 });
    assert.equal(await editor.$eval(`${workspace} .section-editor-main`, element => element.scrollWidth <= element.clientWidth), true, 'Expanded row must fit the mobile editor.');
    await editor.screenshot({ path: join(artifacts, 'content-group-details-mobile.png') });
    await editor.setViewport({ width: 1440, height: 1000 });
    await editor.click(`${workspace} .editor-overview-link`);
    await editor.click(`${workspace} .editor-add-group`);
    await editor.waitForSelector(`${workspace} .patch-edit-group:not([hidden]) input[name^=groupTitle-]`);
    await editor.$eval(`${workspace} .patch-edit-group:not([hidden]) input[name^=groupTitle-]`, element => {
        const input = element as HTMLInputElement; input.value = 'E2E Related Media'; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await editor.waitForFunction((selector: string) => document.querySelector(selector)?.textContent?.includes('E2E Related Media'), {}, `${workspace} .editor-group-list`);
    await editor.$eval(workspace, element => {
        const groups = [...element.querySelectorAll<HTMLElement>('[data-editor-group]')];
        const source = groups.at(-1)!;
        const target = groups[0];
        const transfer = new DataTransfer();
        source.querySelector('.editor-group-handle')!.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
        const bounds = target.getBoundingClientRect();
        target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, clientY: bounds.top + 2 }));
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientY: bounds.top + 2 }));
    });
    await editor.waitForFunction((selector: string) => document.querySelector(selector)?.textContent?.includes('E2E Related Media'), {}, `${workspace} .editor-group-link`);
    assert.equal((await repository.read('genshin')).revision, beforeGroupEdits.revision, 'Group edits must remain drafts until Save.');
    await editor.screenshot({ path: join(artifacts, 'section-editor-group-desktop.png') });
    await editor.setViewport({ width: 390, height: 844 });
    assert.equal(await editor.$eval('gg-story [role=dialog]', element => element.getBoundingClientRect().width <= innerWidth), true);
    assert.equal(await editor.$eval(`${workspace} .section-editor-main`, element => element.scrollWidth <= element.clientWidth), true);
    await editor.screenshot({ path: join(artifacts, 'section-editor-mobile.png') });
    await editor.setViewport({ width: 1440, height: 1000 });
    await clickButton(editor, 'Cancel');
    await editor.waitForSelector('gg-story [role=dialog]', { hidden: true });
    assert.deepEqual((await repository.read('genshin')).entries, beforeGroupEdits.entries, 'Cancel must discard group additions and ordering.');
    await clickButton(editor, 'Edit');
    await editor.waitForSelector(`${workspace} .editor-overview-link`);
    assert.equal(await editor.$$eval(`${workspace} [data-editor-group]`, elements => elements.length), 1);
    await editor.click(`${workspace} .editor-add-group`);
    await editor.waitForSelector(`${workspace} .patch-edit-group:not([hidden]) input[name^=groupTitle-]`);
    await editor.$eval(`${workspace} .patch-edit-group:not([hidden]) input[name^=groupTitle-]`, element => {
        const input = element as HTMLInputElement; input.value = 'E2E Saved Media'; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await editor.focus(`${workspace} .editor-group-item.selected .editor-group-link`);
    await editor.keyboard.down('Alt'); await editor.keyboard.press('ArrowUp'); await editor.keyboard.up('Alt');
    await editor.click(`${workspace} .editor-overview-link`);
    await editor.screenshot({ path: join(artifacts, 'section-editor-overview.png') });
    await editor.click(`${workspace} .editor-template-details-link`);
    const guideContext = 'gg-story [role=dialog] .section-editor-template-details > gg-story-context-editor';
    const contextLabels = await editor.$$eval(`${guideContext} label`, labels => labels.map(label => label.textContent ?? '').join('\n'));
    assert.ok(!/Tracking mode|Current cycle ID|Reset schedule|Chapter \/ act|Quest chain|Region|Area/.test(contextLabels));
    await editor.$eval(guideContext, element => {
        const button = [...element.querySelectorAll('button')].find(button => button.textContent?.trim() === '+ Add requirement');
        if (!button) throw new Error('Add requirement control is missing.');
        button.click();
    });
    await editor.click(`${guideContext} .requirement-link-options summary`);
    await editor.waitForSelector(`${guideContext} gg-requirement-picker input`, { visible: true });
    await editor.type(`${guideContext} gg-requirement-picker input`, 'objective');
    await editor.waitForFunction((selector: string) => document.querySelector(selector)?.textContent?.includes('E2E Objective'), {}, `${guideContext} [role=listbox]`);
    await editor.locator(`${guideContext} [role=option]`).click();
    await editor.waitForSelector(`${guideContext} .requirement-selected`);
    assert.match(await editor.$eval(`${guideContext} .requirement-selected`, element => element.textContent ?? ''), /E2E Objective/);
    assert.equal(await editor.$(`${guideContext} [role=listbox]`), null);
    await editor.$eval(guideContext, element => {
        const button = [...element.querySelectorAll('button')].find(button => button.textContent?.trim() === '+ Add requirement');
        if (!button) throw new Error('Add requirement control is missing.');
        button.click();
    });
    await editor.waitForFunction((selector: string) => document.querySelectorAll(selector).length === 2, {}, `${guideContext} .guide-requirement-editor`);
    await editor.$$eval(`${guideContext} .guide-requirement-editor textarea`, elements => {
        const input = elements.at(-1) as HTMLTextAreaElement;
        input.value = 'Reach Adventure Rank 25'; input.dispatchEvent(new Event('input', { bubbles: true }));
        input.scrollIntoView({ block: 'center' });
    });
    assert.equal(await editor.$eval(`${guideContext} .guide-requirement-editor:last-of-type .requirement-link-options`, element => (element as HTMLDetailsElement).open), false);
    await editor.screenshot({ path: join(artifacts, 'section-editor-requirements.png') });
    await editor.click(`${workspace} .editor-overview-link:not(.editor-template-details-link)`);
    await editor.$eval('gg-story [role=dialog] input[name=title]', element => {
        const input = element as HTMLInputElement;
        input.value = 'E2E Edited Quest';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const imagePath = join(temporary, 'e2e-pixel.png');
    const { writeFile } = await import('node:fs/promises');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHHsAAAAASUVORK5CYII=', 'base64');
    await writeFile(imagePath, png);
    await editor.click(`${workspace} .editor-template-details-link`);
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
    await editor.$eval('gg-story .main-story-template .patch-hero', element => element.scrollIntoView({ block: 'start' }));
    await editor.screenshot({ path: join(artifacts, 'primary-quest-reading-desktop.png') });
    await editor.setViewport({ width: 390, height: 844 });
    assert.equal(await editor.$eval('gg-story .main-story-template', element => element.scrollWidth <= element.clientWidth), true, 'Primary quest banner and cards must fit on mobile.');
    await editor.screenshot({ path: join(artifacts, 'primary-quest-reading-mobile.png') });
    await editor.setViewport({ width: 1440, height: 1000 });
    assert.equal((await repository.read('genshin')).entries.find(entry => entry.id === 'e2e-quest')?.mainStory?.imageUrl, image.url);
    const savedContext = (await repository.read('genshin')).entries.find(entry => entry.id === 'e2e-quest')?.mainStory?.context;
    assert.equal(savedContext?.requirements?.[0].targetId, 'quest:e2e-quest:e2e-row');
    assert.equal(savedContext?.requirements?.[1].text, 'Reach Adventure Rank 25');
    assert.equal(savedContext?.requirements?.[1].targetId, globalThis.undefined);
    assert.equal(savedContext?.region, 'Original region');
    assert.equal(savedContext?.area, 'Original area');
    assert.equal(savedContext?.chain, 'Original chain');
    assert.equal(savedContext?.chapter, 'Original act');
    assert.equal(savedContext?.cycleId, 'original-cycle');
    assert.equal(savedContext?.resetSchedule, 'Weekly');
    const savedGroups = (await repository.read('genshin')).entries.find(entry => entry.id === 'e2e-quest')?.mainStory?.groups;
    assert.deepEqual(savedGroups?.map(group => group.title), ['E2E Saved Media', 'E2E Quest Group']);
    assert.equal((await repository.read('genshin')).entries.find(entry => entry.id === 'e2e-quest')?.mainStory?.rows[0].id, 'e2e-row');
    assert.equal((await api('/api/games/genshin/images', playerToken, 'POST')).status, 403);
    console.log('PASS shared UI edits, browser upload, image persistence/download, and upload permission denial.');
    console.log('PASS requirement title lookup saves an existing quest reference and preserves hidden legacy metadata.');
    console.log('PASS two-pane content editor: responsive layout, group drag ordering, cancel isolation and saved group order.');

    await editor.click(activeEditSwitch);
    await editor.waitForSelector('gg-story .story-mode-toggle[aria-checked=true]');
    await clickButton(editor, '+ Add subsection');
    await editor.select('gg-story [role=dialog] select[name=topic]', 'divider');
    await editor.waitForFunction(() => !document.querySelector('gg-story [role=dialog] input[name=title]'));
    const createDivider = editor.waitForResponse(response => response.url().endsWith('/api/games/genshin/catalog') && response.request().method() === 'PUT');
    await clickButton(editor, 'Create Subsection');
    assert.equal((await createDivider).status(), 200);
    await editor.waitForSelector('gg-story [role=dialog]', { hidden: true });
    const divider = (await repository.read('genshin')).entries.find(entry => entry.category === 'divider');
    assert.ok(divider?.id);
    assert.equal(divider.name, '');
    const reorderDivider = editor.waitForResponse(response => response.url().endsWith('/api/games/genshin/catalog') && response.request().method() === 'PUT');
    await editor.focus('gg-story .story-divider-section .story-drag-handle');
    await editor.keyboard.press('ArrowUp');
    assert.equal((await reorderDivider).status(), 200);
    assert.equal((await repository.read('genshin')).entries.find(entry => entry.id === divider.id)?.order, 0);
    await guest.reload({ waitUntil: 'networkidle0' });
    await guest.waitForSelector('gg-story .story-divider-section [role=separator]');
    assert.equal(await guest.$('gg-story .story-divider-section input[type=checkbox]'), null);
    assert.equal(await guest.$('gg-story .story-divider-section .story-section-header'), null);
    assert.equal(await guest.$(`gg-story .story-outline a[href="#story-content-${divider.id}"]`), null);
    assert.equal(await guest.$eval('gg-story .story-overall-progress p', element => element.textContent?.trim()), '1 / 1 complete');
    await guest.$eval('gg-story .story-divider-section', element => element.scrollIntoView({ block: 'center' }));
    await (await guest.$('gg-story .story-divider-section'))!.screenshot({ path: join(artifacts, 'story-divider.png') });
    console.log('PASS unnamed story divider creation, persisted ordering and decoration without completion or navigation entries.');

    const beforeNavigation = await repository.read('genshin');
    const sampleTemplate = (title: string) => ({ ...emptyPatchOverview(), rows: [{ id: 'sample-objective', content: title, contentType: '', patch: '7.0', notes: '' }] });
    const navigationEntries: CatalogEntry[] = [
        ...beforeNavigation.entries.map(entry => entry.kind === 'story-category' ? { ...entry, sectionImageUrl: image.url } : entry),
        { ...baseEntry, id: 'nav-world', kind: 'story', name: 'An Ark That Used to Be a Soul', category: 'world-quests', storySection: 'e2e-section', order: 2, worldQuests: sampleTemplate('In the Dwelling of Life') },
        { ...baseEntry, id: 'nav-character', kind: 'story', name: 'Fischl', category: 'character-information', storySection: 'e2e-section', order: 3, characterInformation: { ...sampleTemplate('Character Profile'), imageUrl: image.url, characterName: 'Fischl', damageType: 'Electro', faction: "Adventurers' Guild", patchVersion: '1.0', summary: 'A character profile with existing content rows.', sourceName: 'Fixture artwork', sourceUrl: 'https://example.invalid/art' } },
        { ...baseEntry, id: 'nav-side', kind: 'story', name: 'Wraith’s Nocturne', category: 'side-stories', storySection: 'e2e-section', order: 4, sideStories: sampleTemplate('Story Quest') },
        { ...baseEntry, id: 'nav-event', kind: 'story', name: 'Curious Use of Xiranite', category: 'events', storySection: 'e2e-section', order: 5, eventStory: sampleTemplate('Event Objective') },
        { ...baseEntry, id: 'nav-patch', kind: 'story', name: 'Patch 7.1 Overview', category: 'patch-overview', storySection: 'e2e-section', order: 6, patchOverview: sampleTemplate('Patch Notes') },
    ];
    assert.equal((await update(editorToken, beforeNavigation.revision, navigationEntries)).status, 200);
    await guest.reload({ waitUntil: 'networkidle0' });
    assert.equal(await guest.$eval('.region-artwork', target => target.getAttribute('src')), image.url);
    assert.equal(await guest.$$eval('.outline-chapter-heading a', links => links.length), 2);
    assert.equal(await guest.$$eval('.outline-children', elements => elements.every(element => (element as HTMLElement).inert)), true);
    const navigationIcons = await guest.$$eval('.story-outline svg', icons => icons.filter(icon => icon.getClientRects().length).map(icon => {
        const bounds = icon.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
    }));
    assert.ok(navigationIcons.every(icon => icon.width > 0 && icon.width <= 24 && icon.height <= 24), 'Navigation SVGs must remain bounded.');
    // Component styles must keep the outline usable when global CSS is stale or unavailable.
    await guest.$$eval('link[rel=stylesheet]', links => links.forEach(link => { (link as HTMLLinkElement).disabled = true; }));
    assert.equal(await guest.$eval('.outline-chapter-heading', target => getComputedStyle(target).display), 'flex');
    assert.equal(await guest.$eval('.outline-book', target => target.getBoundingClientRect().width), 18);
    assert.equal(await guest.$eval('.outline-type-icon', target => target.getBoundingClientRect().width), 24);
    await guest.$$eval('link[rel=stylesheet]', links => links.forEach(link => { (link as HTMLLinkElement).disabled = false; }));
    await guest.click('.outline-toggle');
    await guest.waitForFunction(() => document.querySelectorAll('.outline-children.expanded').length === 1);
    assert.deepEqual(await guest.$$eval('.outline-secondary', links => links.map(link => link.getAttribute('href'))), ['#story-content-nav-world', '#story-content-nav-character', '#story-content-nav-side', '#story-content-nav-event']);
    assert.deepEqual(await guest.$$eval('.outline-secondary .outline-type-icon', icons => icons.map(icon => icon.getAttribute('data-story-topic'))), ['world-quests', 'character-information', 'side-stories', 'events']);
    assert.equal(await guest.$('.guide-directories'), null);
    await guest.$eval('#story-content-nav-world', target => target.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await guest.$eval('#story-content-nav-world', target => {
        const top = document.querySelector('.story-sticky-header')!.getBoundingClientRect().bottom;
        const bounds = target.getBoundingClientRect();
        window.scrollBy({ top: bounds.top + bounds.height / 2 - (top + (innerHeight - top) / 2), behavior: 'instant' });
    });
    await guest.waitForSelector('.outline-secondary[href="#story-content-nav-world"][aria-current=location]');
    await guest.waitForSelector('.compact-story-toolbar.visible');
    const toolbarHeight = await guest.$eval('.compact-story-toolbar', target => target.getBoundingClientRect().height);
    assert.ok(toolbarHeight >= 60 && toolbarHeight <= 80);
    assert.ok(await guest.$eval('.story-outline', target => target.getBoundingClientRect().top) >= toolbarHeight);
    await guest.click('.compact-progress');
    await guest.waitForSelector('.compact-progress-details.open');
    assert.equal(await guest.$$eval('.compact-progress-details .story-category-card', cards => cards.length), 6);
    await guest.keyboard.press('Escape');
    await guest.waitForFunction(() => !document.querySelector('.compact-progress-details')!.classList.contains('open'));
    assert.equal(await guest.$eval('.outline-secondary.active', target => getComputedStyle(target).boxShadow), 'none');
    await (await guest.$('.story-outline'))!.screenshot({ path: join(artifacts, 'story-navigation-desktop.png') });
    await guest.setViewport({ width: 390, height: 844 });
    await guest.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const mobileOutline = await guest.$eval('.story-outline', target => {
        const bounds = target.getBoundingClientRect();
        return { x: bounds.left, y: bounds.top + scrollY, width: bounds.width, height: bounds.height };
    });
    await guest.screenshot({ path: join(artifacts, 'story-navigation-mobile.png'), clip: mobileOutline, captureBeyondViewport: true });
    await guest.evaluate(() => window.scrollTo({ top: document.querySelector('.story-header-expanded')!.getBoundingClientRect().bottom + scrollY + 80, behavior: 'instant' }));
    await guest.waitForSelector('.compact-story-toolbar.visible');
    await guest.click('.compact-progress');
    await guest.waitForSelector('.compact-progress-details.open');
    assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await guest.click('.compact-search-trigger');
    await guest.waitForSelector('.compact-story-toolbar.search-open');
    await guest.$eval('.compact-story-toolbar input[type=search]', target => {
        const input = target as HTMLInputElement; input.value = 'Fischl'; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await guest.waitForSelector('.compact-story-toolbar .story-search-result');
    assert.equal(await guest.$eval('.story-header-expanded input[type=search]', target => (target as HTMLInputElement).value), 'Fischl');
    assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await guest.$eval('.compact-story-toolbar input[type=search]', target => {
        const input = target as HTMLInputElement; input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await guest.setViewport({ width: 1440, height: 1000 });
    const afterNavigation = await repository.read('genshin');
    const profile = 'gg-story .patch-overview-dashboard[data-story-topic="character-information"]';
    await guest.setViewport({ width: 1920, height: 1080 });
    await guest.$eval(profile, element => element.scrollIntoView({ block: 'center' }));
    assert.equal(await guest.$eval(`${profile} .character-profile-art > img`, element => getComputedStyle(element).display), 'block');
    assert.equal(await guest.$$eval(`${profile} .guide-content-row`, rows => rows.length), 1);
    await (await guest.$(profile))!.screenshot({ path: join(artifacts, 'character-profile-desktop.png') });
    await guest.setViewport({ width: 390, height: 844 });
    assert.equal(await guest.$eval(`${profile} .character-profile-art > img`, element => getComputedStyle(element).display), 'none');
    assert.equal(await guest.$eval(profile, element => element.scrollWidth <= element.clientWidth), true);
    await (await guest.$(profile))!.screenshot({ path: join(artifacts, 'character-profile-mobile.png') });
    await guest.setViewport({ width: 1440, height: 1000 });
    assert.equal((await update(editorToken, afterNavigation.revision, beforeNavigation.entries)).status, 200);
    console.log('PASS story navigation hierarchy, guide ordering, scroll highlighting and responsive layout.');

    // Simultaneous writers must produce exactly one commit and one conflict.
    const current = await repository.read('genshin');
    const conflicts = await Promise.all([update(editorToken, current.revision, current.entries), update(editorToken, current.revision, current.entries)]);
    assert.deepEqual(conflicts.map(response => response.status).sort(), [200, 409]);
    const state = await (await api('/api/me/progress', editorToken)).json();
    const progressConflicts = await Promise.all([0, 1].map(() => api('/api/me/progress', editorToken, 'PATCH', { revision: state.revision, changes: state.state })));
    assert.deepEqual(progressConflicts.map(response => response.status).sort(), [200, 409]);
    console.log('PASS concurrent catalog and account progress writes reject stale revisions.');

    // Verify every extracted page can load its own deferred bundle through existing URLs.
    for (const [route, selector] of [
        ['/dashboard', 'gg-dashboard [aria-label="Workspace summary"] .summary-card'],
        ['/games', 'gg-game-collection .game-card'],
        ['/games/genshin/dashboard', 'gg-dashboard [aria-label="Workspace summary"] .summary-card'],
        ['/settings?tab=data', 'gg-settings .settings'],
        ['/games/genshin/plans', 'gg-progression .collection-empty'],
        ['/games/genshin/characters', 'gg-characters'],
        ['/games/genshin/inventory', 'gg-inventory'],
        ['/games/genshin/teams', 'gg-teams'],
        ['/games/genshin/events', 'gg-events'],
        ['/games/genshin/achievements', 'gg-achievements'],
    ]) {
        await editor.goto(origin + route, { waitUntil: 'networkidle0' });
        await editor.waitForSelector(selector!);
    }
    console.log('PASS global and game feature pages load through their existing routes.');

    const previousRoute = editor.url();
    await editor.click('gg-workspace-sidebar .active-game-selector');
    await editor.waitForSelector('gg-workspace-sidebar #game-selection');
    assert.equal(editor.url(), previousRoute, 'Browsing games must preserve the current workspace.');
    await editor.click('[aria-label="Add Honkai: Star Rail to favorites"]');
    assert.equal(editor.url(), previousRoute, 'Favorites must not switch games.');
    await editor.type('gg-workspace-sidebar input[type=search]', 'star rail');
    await editor.waitForFunction(() => document.querySelectorAll('gg-workspace-sidebar .game-choice').length === 1);
    await editor.screenshot({ path: join(artifacts, 'sidebar-game-search.png') });
    await editor.keyboard.press('Escape');
    await editor.waitForSelector('gg-workspace-sidebar .active-game-selector');
    assert.equal(editor.url(), previousRoute);
    await editor.click('gg-workspace-sidebar .active-game-selector');
    await editor.waitForSelector('gg-workspace-sidebar .is-current .game-choice');
    await editor.click('gg-workspace-sidebar .is-current .game-choice');
    await editor.waitForSelector('gg-workspace-sidebar .active-game-selector');
    assert.equal(editor.url(), previousRoute, 'Reselecting the current game must preserve the full route.');

    await editor.click('gg-workspace-sidebar .active-game-selector');
    await editor.waitForSelector('gg-workspace-sidebar .filter-action');
    await editor.click('gg-workspace-sidebar [aria-label="Game list"] button:nth-child(2)');
    await editor.waitForFunction(() => document.querySelector('gg-workspace-sidebar .game-choice')?.textContent?.includes('Honkai: Star Rail'));
    await editor.click('gg-workspace-sidebar .game-choice');
    await editor.waitForFunction(() => location.pathname === '/games/hsr/dashboard');
    await editor.waitForSelector('gg-workspace-sidebar a[href="/games/hsr/story"]');
    await editor.screenshot({ path: join(artifacts, 'sidebar-workspace.png') });
    await editor.reload({ waitUntil: 'networkidle0' });
    await editor.waitForSelector('gg-workspace-sidebar .active-game-selector');
    await editor.click('gg-workspace-sidebar .active-game-selector');
    await editor.waitForSelector('[aria-label="Remove Honkai: Star Rail from favorites"]');
    await editor.screenshot({ path: join(artifacts, 'sidebar-game-list.png') });
    await editor.keyboard.press('Escape');

    await editor.setViewport({ width: 390, height: 844 });
    await editor.keyboard.down('Control');
    await editor.keyboard.press('k');
    await editor.keyboard.up('Control');
    await editor.waitForSelector('aside.open gg-workspace-sidebar input[type=search]', { visible: true });
    await editor.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Search games');
    await editor.screenshot({ path: join(artifacts, 'sidebar-mobile.png') });
    await editor.keyboard.press('Escape');
    await editor.setViewport({ width: 1440, height: 1000 });
    console.log('PASS two-mode sidebar: route preservation, search, favorites persistence, game switching and mobile keyboard access.');

    const customId = 'e2e-custom-rpg';
    assert.equal((await api('/api/games/registry')).status, 401);
    assert.equal((await api('/api/games/registry', playerToken)).status, 403);
    assert.equal((await api('/api/games', playerToken, 'POST', defaultGameOverview(customId))).status, 403);
    await guest.reload({ waitUntil: 'networkidle0' });
    await guest.click('gg-workspace-sidebar .active-game-selector');
    await guest.waitForSelector('gg-workspace-sidebar #game-selection');
    assert.equal(await guest.$('.game-management-actions'), null);

    await editor.click('gg-workspace-sidebar .active-game-selector');
    await editor.waitForSelector('.game-management-actions');
    await clickButton(editor, '+ Add Game', 'gg-workspace-sidebar');
    await editor.waitForSelector('gg-game-manager input[name=game-title]');
    const fillGame = async (name: string, value: string) => editor.$eval(`gg-game-manager [name=${name}]`, (element, value) => {
        const input = element as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    await fillGame('game-title', 'E2E Custom RPG');
    await fillGame('game-type', 'JRPG');
    await fillGame('game-description', 'A configurable game overview.');
    await editor.$$eval('gg-game-manager .game-feature', labels => {
        (labels.find(label => label.querySelector('strong')?.textContent === 'Events')?.querySelector('input') as HTMLInputElement).click();
    });
    let draftUploads = 0;
    editor.on('request', request => {if (request.url().includes(`/api/games/${customId}/images`) && request.method() === 'POST') {draftUploads++;}});
    const draftFiles = await editor.$$('gg-game-manager input[type=file]');
    assert.equal(draftFiles.length, 2);
    await draftFiles[0].uploadFile(imagePath);
    await draftFiles[1].uploadFile(imagePath);
    await editor.waitForFunction(() => document.querySelectorAll('gg-game-manager .image-preview[src^="blob:"]').length === 2);
    assert.equal(draftUploads, 0, 'Draft images must preview without uploading before creation.');
    await clickButton(editor, 'Advanced', 'gg-game-manager');
    await editor.waitForSelector('#game-advanced-panel:not([hidden])');
    await fillGame('game-short', 'TEST');
    await clickButton(editor, 'Overview', 'gg-game-manager');
    await editor.waitForSelector('#game-overview-panel:not([hidden])');
    await fillGame('game-color', '#3399ff');
    await clickButton(editor, 'Create Game', 'gg-game-manager');
    await editor.waitForSelector('gg-game-manager .game-registry-list');
    assert.equal(draftUploads, 2);
    const createdOverview = (await repository.read(customId)).overview!;
    assert.equal(createdOverview.short, 'TEST');
    assert.equal(createdOverview.color, 'rgba(51, 153, 255, 1)');
    assert.ok(createdOverview.icon && createdOverview.banner);
    await editor.click('[aria-label="Close game manager"]');
    await editor.waitForSelector('gg-game-manager', { hidden: true });
    const selectCustom = async () => {
        await editor.waitForFunction(() => [...document.querySelectorAll('gg-workspace-sidebar .game-choice')].some(button => button.textContent?.includes('E2E')));
        await editor.$$eval('gg-workspace-sidebar .game-choice', buttons => (buttons.find(button => button.textContent?.includes('E2E')) as HTMLButtonElement).click());
        await editor.waitForFunction(id => location.pathname === `/games/${id}/dashboard`, {}, customId);
        await editor.waitForSelector('gg-dashboard .events-panel');
    };
    await selectCustom();
    assert.equal(await editor.evaluate(() => document.documentElement.style.getPropertyValue('--color-game-accent')), 'rgba(51, 153, 255, 1)');
    assert.equal(await editor.$('gg-workspace-sidebar a[href$="/story"]'), null);
    assert.equal(await editor.$('gg-dashboard .story-panel'), null);
    assert.equal(await editor.$('gg-dashboard .summary-characters'), null);
    assert.equal((await api(`/api/games/${customId}/catalog`, editorToken, 'PUT', { revision: 0, entries: [{
        id: 'custom-event', game: customId, kind: 'events', name: 'Custom event', notes: '', category: 'temporary', rarity: 1,
        day: '', order: 0, members: [], requirements: [], startDate: '2026-01-01', endDate: '2099-12-31',
    }] })).status, 200);
    const customProgress = await (await api('/api/me/progress', editorToken)).json();
    assert.equal((await api('/api/me/progress', editorToken, 'PATCH', { revision: customProgress.revision, changes: {
        [`${customId}/custom-event`]: { completed: true, quantity: 0, target: 0 },
    } })).status, 200);
    await editor.goto(origin + `/games/${customId}/story`, { waitUntil: 'networkidle0' });
    await editor.waitForFunction(id => location.pathname === `/games/${id}/dashboard`, {}, customId);
    await editor.waitForSelector('gg-dashboard .dashboard-event-completion:checked');
    await editor.click('gg-workspace-sidebar .active-game-selector');
    await editor.waitForSelector('[aria-label="Edit E2E Custom RPG overview"]');
    await editor.click('[aria-label="Edit E2E Custom RPG overview"]');
    await editor.waitForSelector('gg-game-manager input[name=game-title]');
    await fillGame('game-title', 'E2E Renamed RPG');
    const customUpload = editor.waitForResponse(response => response.url().includes(`/api/games/${customId}/images`) && response.request().method() === 'POST');
    const customIcon = await editor.$('gg-game-manager input[type=file]');
    assert.ok(customIcon);
    await customIcon.uploadFile(imagePath);
    await editor.waitForSelector('gg-game-manager [data-game-field=icon] .image-preview[src^="blob:"]');
    await fillGame('game-color', 'url(https://example.com/invalid)');
    assert.equal(await editor.$$eval('gg-game-manager button', buttons => (buttons.find(button => button.textContent?.trim() === 'Save Changes') as HTMLButtonElement).disabled), true);
    await fillGame('game-color', '#7c3aed');
    await clickButton(editor, 'Advanced', 'gg-game-manager');
    await editor.waitForSelector('#game-advanced-panel:not([hidden])');
    assert.equal(await editor.$eval('gg-game-manager [name=game-id]', element => (element as HTMLInputElement).readOnly), true);
    await clickButton(editor, 'Overview', 'gg-game-manager');
    await editor.waitForSelector('#game-overview-panel:not([hidden])');
    assert.equal(await editor.$$eval('gg-game-manager .game-feature svg', icons => icons.length), 8);
    await editor.screenshot({ path: join(artifacts, 'game-overview-editor.png') });
    await clickButton(editor, 'Save Changes', 'gg-game-manager');
    assert.equal((await customUpload).status(), 201);
    await editor.waitForSelector('[aria-label="Edit E2E Renamed RPG"]');
    assert.equal(await editor.evaluate(() => document.documentElement.style.getPropertyValue('--color-game-accent')), 'rgba(124, 58, 237, 1)');
    await editor.click('[aria-label="Edit E2E Renamed RPG"]');
    await editor.waitForSelector('gg-game-manager input[name=game-title]');
    await clickButton(editor, 'Remove Game', 'gg-game-manager');
    await editor.waitForSelector('.game-remove-confirm');
    await clickButton(editor, 'Confirm Remove Game', 'gg-game-manager');
    await editor.waitForFunction(() => location.pathname === '/games');
    assert.equal((await api(`/api/games/${customId}`)).status, 404);
    assert.equal((await db.collection('games').findOne({ _gameId: customId }))?.['events'].length, 1);
    assert.equal((await (await api('/api/me/progress', editorToken)).json()).state[`${customId}/custom-event`].completed, true);
    await repository.initialize();
    assert.equal((await repository.list()).some(game => game.id === customId), false, 'Startup must not resurrect removed games.');
    await editor.waitForSelector('gg-workspace-sidebar .active-game-selector');
    await editor.click('gg-workspace-sidebar .active-game-selector');
    await editor.waitForSelector('.game-management-actions');
    await clickButton(editor, 'Manage Games', 'gg-workspace-sidebar');
    await editor.waitForSelector('[aria-label="Edit E2E Renamed RPG"]');
    await editor.click('[aria-label="Edit E2E Renamed RPG"]');
    await editor.waitForSelector('gg-game-manager input[name=game-title]');
    await clickButton(editor, 'Restore Game', 'gg-game-manager');
    await editor.waitForSelector('gg-game-manager .game-registry-list');
    await editor.click('[aria-label="Close game manager"]');
    await editor.waitForSelector('gg-game-manager', { hidden: true });
    await selectCustom();
    await editor.waitForSelector('gg-dashboard .dashboard-event-completion:checked');
    const restoredGame = await repository.read(customId);
    assert.equal(restoredGame.name, 'E2E Renamed RPG');
    assert.ok(restoredGame.overview?.icon.startsWith(`/api/games/${customId}/images/`));
    assert.equal((await api(restoredGame.overview!.icon)).status, 200);
    console.log('PASS editor-only game creation, overview/image editing, feature routing, archive/restore and retained custom-game progress.');

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
    const { page: expired, context: expiredContext } = await newPage('e2e-editor', true);
    const preservedProgress = JSON.stringify({ version: 1, state: { 'genshin/guest-preserved': { completed: true, quantity: 0, target: 0 } } });
    await expired.evaluate(progress => { localStorage.setItem('gg-player-v1', progress); localStorage.setItem('e2e-preserved-data', 'keep'); }, preservedProgress);
    let refreshAttempts = 0;
    expired.on('request', request => {if (new URL(request.url()).pathname === '/oauth/token' && request.method() === 'POST') {refreshAttempts++;}});
    await expired.goto(origin + '/games/genshin/story', { waitUntil: 'networkidle0' });
    await expired.waitForFunction(() => document.querySelector('gg-workspace .alert')?.textContent?.includes('Sign in again'));
    // The SDK swallows its initial checkSession error; the first application request then reports it.
    assert.equal(refreshAttempts, 2, 'Only SDK startup and the first application request should attempt the invalid token.');
    await expired.click('gg-workspace-sidebar a[href="/games"]');
    await expired.waitForFunction(() => location.pathname === '/games' && document.querySelector('gg-workspace .alert')?.textContent?.includes('Sign in again'));
    await expired.waitForNetworkIdle({ idleTime: 300, timeout: 5000 });
    assert.equal(refreshAttempts, 2, 'Navigating after recovery must not retry the invalid token.');
    assert.equal(await expired.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('@@auth0spajs@@'))), false);
    assert.equal(await expired.evaluate(() => localStorage.getItem('gg-player-v1')), preservedProgress);
    assert.equal(await expired.evaluate(() => localStorage.getItem('e2e-preserved-data')), 'keep');
    await expired.screenshot({ path: join(artifacts, 'expired-session-recovery.png') });
    await expiredContext.close();
    console.log('PASS invalid refresh token clears only SDK credentials and offers reauthentication without a retry loop or loss of local progress.');
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
    const results = await Promise.allSettled([browser?.close(), close(apiServer), close(uiServer), stopBootstrap()]);
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
