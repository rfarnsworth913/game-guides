import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, request as proxyRequest, type Server } from 'node:http';
import { mkdtemp, readFile, readdir, rm, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, relative, isAbsolute } from 'node:path';
import { MongoClient } from 'mongodb';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { Auth0Security } from '../src/core/auth/providers/auth0.provider';
import { GameRepository } from "../src/modules/games/games.repository";
import { ProgressRepository, type ProgressDocument } from "../src/modules/progress/progress.repository";
import { createApi } from "../src/app/server";
import { GAMES } from '@lib/constants/workspace.constants';
import type { CatalogEntry } from '@lib/types/workspace.type';
import { emptyPatchOverview } from '@common/quests/story-template';
import { AUTH0_PUBLIC } from './auth0-config';
import { defaultGameOverview } from '@common/workspace/game-overview';
import { GameLibraryRepository, type LibraryDocument } from '../src/modules/game-library/game-library.repository';
import { migrateStoryCharacters } from '@common/characters/character-story';
import { migrateStoryEvents } from '@common/events/event-story';
import { emptyCharacterCollection, emptyCharacterDefinition } from '@common/characters/characters';
import type { CharacterRules } from '@lib/types/character.type';

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
    const context = await browser.newContext();
    const page = await context.newPage();
    pages.push(page);
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => runtimeErrors.push(String(error)));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (invalidRefresh && url.origin === issuer.slice(0, -1) && url.pathname === '/oauth/token') {
            // Fixture only: reproduce a permanently invalid refresh token without contacting a real tenant.
            await route.fulfill({ status: request.method() === 'OPTIONS' ? 204 : 403,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': request.headers()['access-control-request-headers'] ?? 'content-type, auth0-client' },
                ...(request.method() === 'OPTIONS' ? {} : { body: JSON.stringify({ error: 'invalid_grant', error_description: 'Unknown or invalid refresh token.' }) }) });
        } else if (url.origin === issuer.slice(0, -1) && ['/v2/logout', '/oidc/logout'].includes(url.pathname)) {
            // Exercise SDK logout/cache clearing; replace only the remote provider redirect.
            await route.fulfill({ status: 302, headers: { location: origin + '/' } });
        } else if (url.origin === origin || ['data:', 'blob:', 'about:'].includes(url.protocol)) {
            await route.continue();
        } else {
            externalRequests.push(url.origin + url.pathname);
            await route.abort();
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
    await page.goto(origin + '/games/genshin/story', { waitUntil: 'networkidle' });
    await page.waitForSelector(checkbox);
}
async function checked(page: Page, expected: boolean): Promise<void> {
    await page.waitForFunction(([selector, value]) => (document.querySelector(selector) as HTMLInputElement)?.checked === value, [checkbox,expected] as const, {});
}
async function clickButton(page: Page, label: string, scope = 'gg-story'): Promise<void> {
    await page.waitForFunction(({scope,label})=>[...document.querySelectorAll(`${scope} button`)].some(item=>item.textContent?.trim()===label && (item as HTMLElement).offsetParent!==null),{scope,label},{});
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
    assert.equal(await db.collection('games_schema_v1_backup').countDocuments({ migration: { $exists: false } }), GAMES.length);
    assert.equal(await db.collection('games_schema_v1_backup').countDocuments({ migration: 'game-configuration-v3' }), GAMES.length);
    await repository.initialize();
    assert.equal(await db.collection('games_schema_v1_backup').countDocuments({ migration: 'game-configuration-v3' }), GAMES.length, 'Configuration migration must be repeatable without replacing backups.');
    assert.equal(await collection.countDocuments({ _schemaVersion: 3, gameConfiguration: { $exists: true }, content: { $exists: true } }), GAMES.length);
    await collection.updateOne({_gameId:'genshin'},{$set:{'gameConfiguration.genre':'RPG','gameConfiguration.searchAliases':['Retired alias']},$unset:{'gameConfiguration.genres':''}});
    const beforeGenres=await collection.findOne({_gameId:'genshin'});
    await repository.initialize();
    const afterGenres=await collection.findOne({_gameId:'genshin'});
    assert.deepEqual(afterGenres?.['gameConfiguration'].genres,['RPG']);
    assert.equal('genre' in afterGenres!['gameConfiguration'],false);
    assert.equal('searchAliases' in afterGenres!['gameConfiguration'],false);
    assert.deepEqual(afterGenres?.['content'],beforeGenres?.['content']);
    assert.equal(afterGenres?.['gameConfiguration'].revision,beforeGenres?.['gameConfiguration'].revision);
    const genreBackup=await db.collection('games_schema_v1_backup').findOne({migration:'game-genres-v1',originalId:beforeGenres!['_id']});
    assert.deepEqual(genreBackup?.['original'],beforeGenres);
    await repository.initialize();
    assert.equal(await db.collection('games_schema_v1_backup').countDocuments({migration:'game-genres-v1'}),1);
    console.log('PASS backed-up genre migration preserves content/revisions, removes retired fields and is idempotent.');
    const progress = new ProgressRepository(db.collection<ProgressDocument>('games_player_progress'));
    origin = await listen(uiServer);
    // Generated key injection is confined to this entry point. Production main.ts is unchanged.
    const security = new Auth0Security({ ...AUTH0_PUBLIC, origin, editors: ['e2e-editor'] }, publicKey.export({ type: 'spki', format: 'pem' }).toString());
    apiServer = createApi(repository, [origin], () => db.command({ ping: 1 }), assets, security, progress,new GameLibraryRepository(db.collection<LibraryDocument>('game_libraries')));
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

    browser = await chromium.launch({ headless: true });
    const { page: guest } = await newPage();
    await openStory(guest);
    assert.equal(await guest.$('gg-story .story-mode-toggle'), null);
    await checked(guest, false);
    await guest.click(checkbox);
    await checked(guest, true);
    await guest.reload({ waitUntil: 'networkidle' });
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
    await editor.reload({ waitUntil: 'networkidle' });
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
    await editor.waitForSelector(`${rowEditor} .compact-row-fields`, { state: 'visible' });
    assert.equal(await editor.$$eval(`${rowEditor} .context-panel-toggle`, buttons => buttons.every(button => button.getAttribute('aria-expanded') === 'false')), true);
    await editor.click(`${rowEditor} .context-panel-toggle`);
    await editor.waitForSelector(`${rowEditor} .context-panel-body.expanded`);
    await editor.$eval(`${workspace} .section-editor-main`, element => { element.scrollTop = 0; });
    await editor.screenshot({ path: join(artifacts, 'content-group-details-desktop.png') });
    await editor.setViewportSize({ width: 390, height: 844 });
    assert.equal(await editor.$eval(`${workspace} .section-editor-main`, element => element.scrollWidth <= element.clientWidth), true, 'Expanded row must fit the mobile editor.');
    await editor.screenshot({ path: join(artifacts, 'content-group-details-mobile.png') });
    await editor.setViewportSize({ width: 1440, height: 1000 });
    await editor.click(`${workspace} .editor-overview-link`);
    await editor.click(`${workspace} .editor-add-group`);
    await editor.waitForSelector(`${workspace} .patch-edit-group:not([hidden]) input[name^=groupTitle-]`);
    await editor.$eval(`${workspace} .patch-edit-group:not([hidden]) input[name^=groupTitle-]`, element => {
        const input = element as HTMLInputElement; input.value = 'E2E Related Media'; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await editor.waitForFunction((selector: string) => document.querySelector(selector)?.textContent?.includes('E2E Related Media'), `${workspace} .editor-group-list`, {});
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
    await editor.waitForFunction((selector: string) => document.querySelector(selector)?.textContent?.includes('E2E Related Media'), `${workspace} .editor-group-link`, {});
    assert.equal((await repository.read('genshin')).revision, beforeGroupEdits.revision, 'Group edits must remain drafts until Save.');
    await editor.screenshot({ path: join(artifacts, 'section-editor-group-desktop.png') });
    await editor.setViewportSize({ width: 390, height: 844 });
    assert.equal(await editor.$eval('gg-story [role=dialog]', element => element.getBoundingClientRect().width <= innerWidth), true);
    assert.equal(await editor.$eval(`${workspace} .section-editor-main`, element => element.scrollWidth <= element.clientWidth), true);
    await editor.screenshot({ path: join(artifacts, 'section-editor-mobile.png') });
    await editor.setViewportSize({ width: 1440, height: 1000 });
    await clickButton(editor, 'Cancel');
    await editor.waitForSelector('gg-story [role=dialog]', { state: 'hidden' });
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
    await editor.waitForSelector(`${guideContext} gg-requirement-picker input`, { state: 'visible' });
    await editor.type(`${guideContext} gg-requirement-picker input`, 'objective');
    await editor.waitForFunction((selector: string) => document.querySelector(selector)?.textContent?.includes('E2E Objective'), `${guideContext} [role=listbox]`, {});
    await editor.locator(`${guideContext} [role=option]`).filter({hasText: 'E2E Objective'}).click();
    await editor.waitForSelector(`${guideContext} .requirement-selected`);
    assert.match(await editor.$eval(`${guideContext} .requirement-selected`, element => element.textContent ?? ''), /E2E Objective/);
    assert.equal(await editor.$(`${guideContext} [role=listbox]`), null);
    await editor.$eval(guideContext, element => {
        const button = [...element.querySelectorAll('button')].find(button => button.textContent?.trim() === '+ Add requirement');
        if (!button) throw new Error('Add requirement control is missing.');
        button.click();
    });
    await editor.waitForFunction((selector: string) => document.querySelectorAll(selector).length === 2, `${guideContext} .guide-requirement-editor`, {});
    await editor.$$eval(`${guideContext} .guide-requirement-editor textarea`, elements => {
        const input = elements.at(-1) as HTMLTextAreaElement;
        input.value = 'Reach Adventure Rank 25'; input.dispatchEvent(new Event('input', { bubbles: true }));
        input.scrollIntoView({ block: 'center' });
    });
    assert.equal(await editor.$(`${guideContext} .guide-requirement-editor:last-of-type details.requirement-link-options`), null);
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
    await fileInput.setInputFiles(imagePath);
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
    await editor.waitForSelector('gg-story [role=dialog]', { state: 'hidden' });
    await guest.reload({ waitUntil: 'networkidle' });
    await guest.waitForFunction(() => document.querySelector('gg-story')?.textContent?.includes('E2E Edited Quest'));
    await editor.reload({ waitUntil: 'networkidle' });
    await checked(editor, true);
    await editor.$eval('gg-story .main-story-template .patch-hero', element => element.scrollIntoView({ block: 'start' }));
    await editor.screenshot({ path: join(artifacts, 'primary-quest-reading-desktop.png') });
    await editor.setViewportSize({ width: 390, height: 844 });
    assert.equal(await editor.$eval('gg-story .main-story-template', element => element.scrollWidth <= element.clientWidth), true, 'Primary quest banner and cards must fit on mobile.');
    await editor.screenshot({ path: join(artifacts, 'primary-quest-reading-mobile.png') });
    await editor.setViewportSize({ width: 1440, height: 1000 });
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
    await clickButton(editor, 'Edit section');
    await editor.waitForSelector('.navigation-group-modal');
    assert.equal(await editor.$eval('.navigation-group-modal h2', element => element.textContent?.trim()), 'Edit Navigation Group');
    assert.ok(await editor.$('.navigation-category-icon .compact-icon-button'));
    const originalNavigationGroup = (await repository.read('genshin')).entries.find(entry => entry.id === 'e2e-section');
    await editor.click('.navigation-group-banner .image-actions button');
    await editor.waitForSelector('.navigation-group-banner .game-image-dialog[open] .library-categories');
    await editor.locator('.navigation-group-banner .library-categories button').filter({ hasText: 'All' }).click();
    await editor.waitForSelector('.navigation-group-banner .image-library .image-select');
    await editor.locator('.navigation-group-banner .image-preview-action').first().click();
    await editor.waitForSelector('.library-image-preview[open] .library-full-image');
    await editor.screenshot({ path: join(artifacts, 'image-library-preview.png') });
    await editor.keyboard.press('Escape');
    await editor.waitForSelector('.library-image-preview', { state: 'hidden' });
    assert.ok(await editor.$('.navigation-group-banner .game-image-dialog[open]'));
    await editor.locator('.navigation-group-banner .image-library .image-select').first().click();
    await editor.waitForSelector('.navigation-group-banner .selected-check');
    await editor.screenshot({ path: join(artifacts, 'image-library-desktop.png') });
    const libraryViewport = editor.viewportSize()!;
    await editor.setViewportSize({ width: 390, height: 844 });
    assert.ok(await editor.$eval('.navigation-group-banner .game-image-dialog', element => {
        const bounds = element.getBoundingClientRect();
        const footer = element.querySelector('.library-footer')!.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth && footer.bottom <= innerHeight && element.scrollWidth <= element.clientWidth + 1;
    }), 'Image browser and fixed footer must fit mobile screens.');
    await editor.screenshot({ path: join(artifacts, 'image-library-mobile.png') });
    await editor.setViewportSize(libraryViewport);
    await editor.locator('.navigation-group-banner .use-selected').click();
    await editor.waitForSelector('.navigation-group-banner .banner-preview');
    await editor.screenshot({ path: join(artifacts, 'navigation-group-desktop.png') });
    const navigationViewport = editor.viewportSize()!;
    await editor.setViewportSize({ width: 390, height: 844 });
    assert.ok(await editor.$eval('.navigation-group-modal', element => {
        const bounds = element.getBoundingClientRect();
        const actions = element.querySelector('.modal-actions')!.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth && element.scrollWidth <= element.clientWidth + 1 && actions.bottom <= innerHeight;
    }), 'Navigation group fields and footer must fit a narrow viewport.');
    await editor.screenshot({ path: join(artifacts, 'navigation-group-mobile.png') });
    await clickButton(editor, 'Cancel', '.navigation-group-modal');
    assert.deepEqual((await repository.read('genshin')).entries.find(entry => entry.id === 'e2e-section'), originalNavigationGroup, 'Cancelling artwork selection must preserve the stored navigation group.');
    await editor.setViewportSize(navigationViewport);
    console.log('PASS navigation group dialog: standard icon picker, banner preview, responsive layout and cancellation isolation.');
    await clickButton(editor, '+ Add subsection');
    await editor.selectOption('gg-story [role=dialog] select[name=topic]', 'divider');
    await editor.waitForFunction(() => !document.querySelector('gg-story [role=dialog] input[name=title]'));
    const createDivider = editor.waitForResponse(response => response.url().endsWith('/api/games/genshin/catalog') && response.request().method() === 'PUT');
    await clickButton(editor, 'Create Subsection');
    assert.equal((await createDivider).status(), 200);
    await editor.waitForSelector('gg-story [role=dialog]', { state: 'hidden' });
    const divider = (await repository.read('genshin')).entries.find(entry => entry.category === 'divider');
    assert.ok(divider?.id);
    assert.equal(divider.name, '');
    const reorderDivider = editor.waitForResponse(response => response.url().endsWith('/api/games/genshin/catalog') && response.request().method() === 'PUT');
    await editor.focus('gg-story .story-divider-section .story-drag-handle');
    await editor.keyboard.press('ArrowUp');
    assert.equal((await reorderDivider).status(), 200);
    assert.equal((await repository.read('genshin')).entries.find(entry => entry.id === divider.id)?.order, 0);
    await guest.reload({ waitUntil: 'networkidle' });
    await guest.waitForSelector('gg-story .story-divider-section [role=separator]');
    assert.equal(await guest.$('gg-story .story-divider-section input[type=checkbox]'), null);
    assert.equal(await guest.$('gg-story .story-divider-section .story-section-header'), null);
    assert.equal(await guest.$(`gg-story .story-outline a[href$="#story-content-${divider.id}"]`), null);
    assert.equal(await guest.$eval('gg-story .story-overall-progress p', element => element.textContent?.trim()), '1 / 1 complete');
    await guest.$eval('gg-story .story-divider-section', element => element.scrollIntoView({ block: 'center' }));
    await (await guest.$('gg-story .story-divider-section'))!.screenshot({ path: join(artifacts, 'story-divider.png') });
    console.log('PASS unnamed story divider creation, persisted ordering and decoration without completion or navigation entries.');

    const beforeNavigation = await repository.read('genshin');
    const sampleTemplate = (title: string) => ({ ...emptyPatchOverview(), rows: [{ id: 'sample-objective', content: title, contentType: '', patch: '7.0', notes: '' }] });
    const navigationEntries: CatalogEntry[] = [
        ...beforeNavigation.entries.map(entry => entry.kind === 'story-category' ? { ...entry, sectionImageUrl: image.url } : entry),
        { ...baseEntry, id: 'nav-world', kind: 'story', name: 'An Ark That Used to Be a Soul', category: 'world-quests', storySection: 'e2e-section', order: 2, worldQuests: { ...sampleTemplate('In the Dwelling of Life'), patchVersion: '7.0', summary: 'Explore this region and follow the quest chain.', groups: [
            { id: 'region', title: 'The Hub', worldQuestMode: 'region' }, { id: 'chain', title: 'Quest chain', worldQuestMode: 'questChain', objectiveIds: ['sample-objective'] },
        ], rows: [
            { id: 'world-heading', groupId: 'region', rowType: 'heading', content: 'Investigation', contentType: '', contentUrl: 'https://example.invalid/investigation', patch: '', notes: '' },
            { ...sampleTemplate('In the Dwelling of Life').rows[0], groupId: 'region', notes: 'Additional **exploration** guidance.', context: { prerequisites: [] } },
        ] } },
        { ...baseEntry, id: 'nav-character', kind: 'story', name: 'Fischl', category: 'character-information', storySection: 'e2e-section', order: 3, characterInformation: { ...sampleTemplate('Character Profile'), imageUrl: image.url, characterName: 'Fischl', damageType: 'Electro', faction: "Adventurers' Guild", patchVersion: '1.0', summary: 'A character profile with existing content rows.', sourceName: 'Fixture artwork', sourceUrl: 'https://example.invalid/art' } },
        { ...baseEntry, id: 'nav-side', kind: 'story', name: 'Wraith’s Nocturne', category: 'side-stories', storySection: 'e2e-section', order: 4, sideStories: sampleTemplate('Story Quest') },
        { ...baseEntry, id: 'nav-event', kind: 'story', name: 'Curious Use of Xiranite', category: 'events', storySection: 'e2e-section', order: 5, eventStory: { ...sampleTemplate('Event Objective'), imageUrl: image.url, sourceName: 'Fixture artwork', sourceUrl: 'https://example.invalid/art' } },
        { ...baseEntry, id: 'nav-patch', kind: 'story', name: 'Patch 7.1 Overview', category: 'patch-overview', storySection: 'e2e-section', order: 6, patchOverview: sampleTemplate('Patch Notes') },
    ];
    const sharedCharacterEntries = migrateStoryEvents(migrateStoryCharacters(navigationEntries, () => 'shared-fischl').entries, () => 'shared-event').entries;
    assert.equal((await update(editorToken, beforeNavigation.revision, sharedCharacterEntries)).status, 200);
    await guest.reload({ waitUntil: 'networkidle' });
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
    await guest.$eval('.outline-toggle', button => (button as HTMLButtonElement).click());
    await guest.waitForFunction(() => document.querySelectorAll('.outline-children.expanded').length === 1);
    assert.deepEqual(await guest.$$eval('.outline-secondary', links => links.map(link => new URL((link as HTMLAnchorElement).href).hash)), ['#story-content-nav-world', '#story-content-nav-character', '#story-content-nav-side', '#story-content-nav-event']);
    assert.deepEqual(await guest.$$eval('.outline-secondary .outline-type-icon', icons => icons.map(icon => icon.getAttribute('data-story-topic'))), ['world-quests', 'character-information', 'side-stories', 'events']);
    assert.equal(await guest.$('.guide-directories'), null);
    await guest.$eval('#story-content-nav-world', target => target.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await guest.$eval('#story-content-nav-world', target => {
        const top = document.querySelector('.story-sticky-header')!.getBoundingClientRect().bottom;
        const bounds = target.getBoundingClientRect();
        window.scrollBy({ top: bounds.top + bounds.height / 2 - (top + (innerHeight - top) / 2), behavior: 'instant' });
    });
    await guest.waitForSelector('.outline-secondary[href$="#story-content-nav-world"][aria-current=location]');
    await guest.waitForFunction(() => {
        const target = document.querySelector('.outline-secondary[href$="#story-content-nav-world"][aria-current=location]');
        return target?.classList.contains('active') && getComputedStyle(target).boxShadow === 'none';
    });
    await guest.bringToFront();
    // Centering a short section can leave part of the expanded header visible.
    // Verify the compact toolbar only after explicitly moving that header offscreen.
    await guest.evaluate(() => {
        const bottom = document.querySelector('.story-header-expanded')!.getBoundingClientRect().bottom;
        if (bottom >= 0) {window.scrollBy({top:bottom + 80,behavior:'instant'});}
    });
    await guest.waitForSelector('.compact-story-toolbar.visible');
    const toolbarHeight = await guest.$eval('.compact-story-toolbar', target => target.getBoundingClientRect().height);
    assert.ok(toolbarHeight >= 60 && toolbarHeight <= 80);
    assert.ok(await guest.$eval('.story-outline', target => target.getBoundingClientRect().top) >= toolbarHeight);
    await guest.click('.compact-progress');
    await guest.waitForSelector('.compact-progress-details.open');
    assert.equal(await guest.$$eval('.compact-progress-details .story-category-card', cards => cards.length), 6);
    await guest.keyboard.press('Escape');
    await guest.waitForFunction(() => !document.querySelector('.compact-progress-details')!.classList.contains('open'));
    await (await guest.$('.story-outline'))!.screenshot({ path: join(artifacts, 'story-navigation-desktop.png') });
    await guest.setViewportSize({ width: 390, height: 844 });
    await guest.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const mobileOutline = await guest.$eval('.story-outline', target => {
        const bounds = target.getBoundingClientRect();
        return { x: bounds.left, y: bounds.top + scrollY, width: bounds.width, height: bounds.height };
    });
    await guest.screenshot({ path: join(artifacts, 'story-navigation-mobile.png'), clip: mobileOutline });
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
    await guest.setViewportSize({ width: 1440, height: 1000 });
    const profile = 'gg-story .patch-overview-dashboard[data-story-topic="character-information"]';
    await guest.setViewportSize({ width: 1920, height: 1080 });
    const world = '#story-template-nav-world';
    assert.equal(await guest.$(`${world} .patch-hero`), null);
    assert.equal(await guest.$eval(`${world} .world-quest-title`, element => getComputedStyle(element).display), 'block');
    await guest.$eval(world, element => element.scrollIntoView({ block: 'center' }));
    assert.equal(await guest.$eval(`${world} .guide-group-progress`, element => getComputedStyle(element).flexDirection), 'row');
    await (await guest.$(world))!.screenshot({ path: join(artifacts, 'world-quest-reading-desktop.png') });
    await guest.$eval(profile, element => element.scrollIntoView({ block: 'center' }));
    assert.equal(await guest.$eval(`${profile} .character-profile-art > img`, element => getComputedStyle(element).display), 'block');
    assert.equal(await guest.$$eval(`${profile} .guide-content-row`, rows => rows.length), 1);
    await (await guest.$(profile))!.screenshot({ path: join(artifacts, 'character-profile-desktop.png') });
    await guest.setViewportSize({ width: 390, height: 844 });
    assert.equal(await guest.$eval(world, element => element.scrollWidth <= element.clientWidth), true);
    assert.equal(await guest.$eval(`${world} .world-quest-title`, element => element.scrollHeight <= element.clientHeight), true);
    await (await guest.$(world))!.screenshot({ path: join(artifacts, 'world-quest-reading-mobile.png') });
    assert.equal(await guest.$eval(`${profile} .character-profile-art > img`, element => getComputedStyle(element).display), 'none');
    assert.equal(await guest.$eval(profile, element => element.scrollWidth <= element.clientWidth), true);
    await (await guest.$(profile))!.screenshot({ path: join(artifacts, 'character-profile-mobile.png') });
    await guest.setViewportSize({ width: 1440, height: 1000 });
    await editor.reload({ waitUntil: 'networkidle' });
    if (await editor.$('.story-mode-toggle[aria-checked="false"]')) {await editor.click('.story-mode-toggle[aria-checked="false"]');}
    await editor.waitForSelector('[aria-label="Edit Fischl"]');
    await editor.click('[aria-label="Edit Fischl"]');
    await editor.waitForSelector('gg-story [role=dialog] .editor-template-details-link');
    await editor.click('gg-story [role=dialog] .editor-template-details-link');
    await editor.$eval('gg-story [role=dialog] .section-editor-template-details', element => {
        const label = [...element.querySelectorAll('label')].find(label => label.textContent?.trim().startsWith('Character Name'))!;
        const input = label.querySelector('input')!; input.value = 'Fischl Updated'; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const sharedSave = editor.waitForResponse(response => response.url().endsWith('/api/games/genshin/catalog') && response.request().method() === 'PUT');
    await clickButton(editor, 'Save changes'); assert.equal((await sharedSave).status(), 200);
    await editor.waitForSelector('gg-story [role=dialog]', { state: 'hidden' });
    const sharedSnapshot = await repository.read('genshin');
    assert.equal(sharedSnapshot.entries.find(entry => entry.id === 'shared-fischl')?.name, 'Fischl Updated');
    assert.equal(sharedSnapshot.entries.find(entry => entry.id === 'nav-character')?.characterInformation, globalThis.undefined);
    assert.equal(sharedSnapshot.entries.find(entry => entry.id === 'nav-character')?.characterId, 'shared-fischl');
    const characterCheckbox = `${profile} .guide-row-tracking input`;
    await player.reload({ waitUntil: 'networkidle' });
    const sharedProgress = player.waitForResponse(response => response.url().endsWith('/api/me/progress') && response.request().method() === 'PATCH');
    await player.click(characterCheckbox); assert.equal((await sharedProgress).status(), 200);
    await player.reload({ waitUntil: 'networkidle' });
    assert.equal(await player.$eval(characterCheckbox, input => (input as HTMLInputElement).checked), true);
    assert.equal(await player.$eval(`${profile} .character-info-header h3`, element => element.textContent), 'Fischl Updated');
    console.log('PASS shared character guide reference edits the catalog and preserves account completion after reload.');
    await editor.click('[aria-label="Edit Curious Use of Xiranite"]');
    await editor.waitForSelector('gg-story [role=dialog] .editor-template-details-link');
    await editor.click('gg-story [role=dialog] .editor-template-details-link');
    await editor.$eval('gg-story [role=dialog] .section-editor-template-details', element => {
        const label = [...element.querySelectorAll('label')].find(label => label.textContent?.trim().startsWith('Subtitle'))!;
        const input = label.querySelector('input')!; input.value = 'Shared event details'; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const eventSave = editor.waitForResponse(response => response.url().endsWith('/api/games/genshin/catalog') && response.request().method() === 'PUT');
    await clickButton(editor, 'Save changes'); assert.equal((await eventSave).status(), 200);
    await editor.waitForSelector('gg-story [role=dialog]', { state: 'hidden' });
    const eventSnapshot = await repository.read('genshin');
    assert.equal(eventSnapshot.entries.find(entry => entry.id === 'shared-event')?.eventStory?.subtitle, 'Shared event details');
    assert.equal(eventSnapshot.entries.find(entry => entry.id === 'nav-event')?.eventId, 'shared-event');
    assert.equal(eventSnapshot.entries.find(entry => entry.id === 'nav-event')?.eventStory, globalThis.undefined);
    await player.reload({ waitUntil: 'networkidle' });
    const eventCheckbox = '#story-row-nav-event-sample-objective input';
    const eventProgress = player.waitForResponse(response => response.url().endsWith('/api/me/progress') && response.request().method() === 'PATCH');
    await player.click(eventCheckbox); assert.equal((await eventProgress).status(), 200);
    await player.reload({ waitUntil: 'networkidle' });
    assert.equal(await player.$eval(eventCheckbox, input => (input as HTMLInputElement).checked), true);
    assert.ok(await player.$eval('#story-template-nav-event', element => element.textContent?.includes('Shared event details')));
    await editor.click('[aria-label="Edit Curious Use of Xiranite"]');
    await editor.waitForSelector('gg-story [role=dialog] [name=topic]');
    await editor.selectOption('gg-story [role=dialog] [name=topic]', 'endgame-activity');
    await editor.waitForSelector('.template-conversion-review, .template-conversion-notice');
    if (await editor.$('.template-conversion-review')) { await editor.click('.template-conversion-review .primary'); }
    await editor.waitForSelector('.template-conversion-notice');
    const conversionSave = editor.waitForResponse(response => response.url().endsWith('/api/games/genshin/catalog') && response.request().method() === 'PUT');
    await clickButton(editor, 'Save changes'); assert.equal((await conversionSave).status(), 200);
    await editor.waitForSelector('gg-story [role=dialog]', { state: 'hidden' });
    const converted = (await repository.read('genshin')).entries.find(entry => entry.id === 'nav-event')!;
    assert.equal(converted.category, 'endgame-activity'); assert.equal(converted.eventId, 'shared-event');
    await player.reload({ waitUntil: 'networkidle' }); await player.waitForSelector(eventCheckbox);
    assert.equal(await player.$eval(eventCheckbox, input => (input as HTMLInputElement).checked), true);
    await player.$eval('#story-template-nav-event', element => element.scrollIntoView({ block: 'center' }));
    assert.equal(await player.$('#story-template-nav-event .patch-hero, #story-template-nav-event .guide-event-info'), null);
    const activityLayout = await player.$eval('#story-template-nav-event', element => {
        const header = element.querySelector('.endgame-header')!.getBoundingClientRect();
        const art = element.querySelector('.endgame-art')!.getBoundingClientRect();
        return { headerTop: header.top, artTop: art.top, headerRight: header.right, artLeft: art.left };
    });
    assert.ok(Math.abs(activityLayout.headerTop - activityLayout.artTop) < 2);
    assert.ok(activityLayout.artLeft > activityLayout.headerRight);
    await (await player.$('#story-template-nav-event'))!.screenshot({ path: join(artifacts, 'endgame-activity-desktop.png') });
    await player.setViewportSize({ width: 390, height: 844 });
    assert.ok(await player.$eval('#story-template-nav-event', element => element.querySelector('.endgame-art')!.getBoundingClientRect().top >= element.querySelector('gg-story-content-list')!.getBoundingClientRect().bottom));
    await (await player.$('#story-template-nav-event'))!.screenshot({ path: join(artifacts, 'endgame-activity-mobile.png') });
    assert.equal(await player.$eval('#story-template-nav-event', element => element.scrollWidth > element.clientWidth + 1), false);
    await player.setViewportSize({ width: 1440, height: 1000 });
    console.log('PASS end-game activity conversion preserves shared event identity, completion and attribution with responsive supporting artwork.');
    await player.goto(origin + '/events', { waitUntil: 'networkidle' });
    // This fixture has no dates, so it is available in the backlog rather than the grid.
    await player.$eval('.events-backlog-button', button => (button as HTMLButtonElement).click());
    const sharedCheckbox = '.event-backlog input[aria-label="Mark Curious Use of Xiranite incomplete"]';
    await player.waitForSelector(sharedCheckbox);
    assert.equal(await player.$eval(sharedCheckbox, input => (input as HTMLInputElement).checked), true);
    const sharedEventProgress = player.waitForResponse(response => response.url().endsWith('/api/me/progress') && response.request().method() === 'PATCH');
    await player.click(sharedCheckbox); assert.equal((await sharedEventProgress).status(), 200);
    await player.goto(origin + '/games/genshin/story', { waitUntil: 'networkidle' });
    await player.waitForSelector(eventCheckbox);
    assert.equal(await player.$eval(eventCheckbox, input => (input as HTMLInputElement).checked), false);
    console.log('PASS shared event guide and calendar synchronize account completion in both directions after reload.');
    const eventsBeforeActivity = (await repository.read('genshin')).entries.filter(item => item.kind === 'events').map(item => item.id).sort();
    await clickButton(editor, '+ Add subsection');
    await editor.selectOption('gg-story [role=dialog] [name=topic]', 'endgame-activity');
    await editor.fill('gg-story [role=dialog] [name=title]', 'E2E Independent Activity');
    const independentSave = editor.waitForResponse(response => response.url().endsWith('/api/games/genshin/catalog') && response.request().method() === 'PUT');
    await clickButton(editor, 'Create Subsection'); assert.equal((await independentSave).status(), 200);
    await editor.waitForSelector('gg-story [role=dialog]', { state: 'hidden' });
    const independentSnapshot = await repository.read('genshin');
    const independentActivity = independentSnapshot.entries.find(item => item.name === 'E2E Independent Activity')!;
    assert.equal(independentActivity.kind, 'story'); assert.equal(independentActivity.category, 'endgame-activity');
    assert.ok(independentActivity.storyContent); assert.equal(independentActivity.eventId, globalThis.undefined);
    assert.deepEqual(independentSnapshot.entries.filter(item => item.kind === 'events').map(item => item.id).sort(), eventsBeforeActivity);
    console.log('PASS independent End-Game Activity creation does not create or link an Event/calendar record.');
    const eventBeforeRemoval = independentSnapshot.entries.find(item => item.id === 'shared-event')!;
    await editor.click('[aria-label="Edit Curious Use of Xiranite"]');
    await editor.click('gg-story [role=dialog] .editor-template-details-link');
    await editor.waitForSelector('.preserved-content');
    await clickButton(editor, 'Remove field'); await clickButton(editor, 'Confirm removal');
    await editor.waitForSelector('.preserved-content', { state: 'hidden' });
    const removalSave = editor.waitForResponse(response => response.url().endsWith('/api/games/genshin/catalog') && response.request().method() === 'PUT');
    await clickButton(editor, 'Save changes'); assert.equal((await removalSave).status(), 200);
    await editor.waitForSelector('gg-story [role=dialog]', { state: 'hidden' });
    for (let reopen = 0; reopen < 2; reopen++) {
        await editor.reload({ waitUntil: 'networkidle' });
        await editor.waitForSelector(activeEditSwitch); await editor.click(activeEditSwitch);
        await editor.click('[aria-label="Edit Curious Use of Xiranite"]');
        await editor.click('gg-story [role=dialog] .editor-template-details-link');
        assert.equal(await editor.$('.preserved-content'), null, 'Explicitly removed context must not be regenerated after reload.');
        await clickButton(editor, 'Save changes'); await editor.waitForSelector('gg-story [role=dialog]', { state: 'hidden' });
    }
    const afterRemoval = await repository.read('genshin');
    assert.ok(afterRemoval.entries.find(item => item.id === 'nav-event')?.removedPreservedFields?.includes('context.availability'));
    const eventAfterRemoval = afterRemoval.entries.find(item => item.id === 'shared-event')!;
    assert.equal(eventAfterRemoval.eventType, eventBeforeRemoval.eventType);
    assert.equal(eventAfterRemoval.startDate, eventBeforeRemoval.startDate); assert.equal(eventAfterRemoval.endDate, eventBeforeRemoval.endDate);
    assert.deepEqual(eventAfterRemoval.eventStory?.rows, eventBeforeRemoval.eventStory?.rows);
    console.log('PASS removed preserved fields stay removed through repeated save/reload without changing Event scheduling or objectives.');
    const afterNavigation = await repository.read('genshin');
    assert.equal((await update(editorToken, afterNavigation.revision, beforeNavigation.entries)).status, 200);
    console.log('PASS story navigation hierarchy, guide ordering, scroll highlighting and responsive layout.');

    // Simultaneous writers must produce exactly one commit and one conflict.
    const current = await repository.read('genshin');
    const conflicts = await Promise.all([update(editorToken, current.revision, current.entries), update(editorToken, current.revision, current.entries)]);
    assert.deepEqual(conflicts.map(response => response.status).sort(), [200, 409]);
    const state = await (await api('/api/me/progress', editorToken)).json();
    // Retain historical progress for removed fixture content, but only replay current records,
    // matching the application's delta writes rather than resubmitting retired content.
    const currentIds = new Set(current.entries.map(entry => entry.id));
    const currentState = Object.fromEntries(Object.entries(state.state as Record<string, unknown>).filter(([key]) => key.startsWith('genshin/') && currentIds.has(key.slice('genshin/'.length))));
    const progressConflicts = await Promise.all([0, 1].map(() => api('/api/me/progress', editorToken, 'PATCH', { revision: state.revision, changes: currentState })));
    assert.deepEqual(progressConflicts.map(response => response.status).sort(), [200, 409]);
    console.log('PASS concurrent catalog and account progress writes reject stale revisions.');

    const beforeBalance = await repository.read('genshin');
    const balanceStart = new Date(), balanceEnd = new Date(balanceStart.getFullYear(), balanceStart.getMonth(), balanceStart.getDate() + 2);
    const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const balanceFixtures: CatalogEntry[] = Array.from({ length: 6 }, (_, index) => ({ ...baseEntry, id: `balance-event-${index}`, game: 'genshin', kind: 'events', category: 'temporary', eventType: 'temporary', name: `Balanced event ${index}`, startDate: localDate(balanceStart), endDate: localDate(balanceEnd) }));
    const backlogFixture: CatalogEntry = { ...baseEntry, id: 'balance-backlog', game: 'genshin', kind: 'events', category: 'temporary', eventType: 'temporary', name: 'Unscheduled objective event', eventStory: { ...emptyPatchOverview(), rows: [
        { id: 'required-one', content: 'First objective', contentType: '', patch: '', notes: '' },
        { id: 'required-two', content: 'Second objective', contentType: '', patch: '', notes: '' },
        { id: 'optional', content: 'Optional objective', contentType: '', patch: '', notes: '', optional: true },
    ] } };
    assert.equal((await update(editorToken, beforeBalance.revision, [...beforeBalance.entries, ...balanceFixtures, backlogFixture])).status, 200);
    await editor.goto(origin + '/events', { waitUntil: 'networkidle' });
    await editor.waitForSelector('gg-events .event-calendar');
    assert.equal(new URL(editor.url()).pathname, '/events');
    assert.equal(await editor.$eval('h1', element => element.textContent?.trim()), 'Events Calendar');
    assert.equal(await editor.$$eval('.event-calendar td', cells => cells.length), 42);
    await editor.$eval('.event-summary-stats', element => { ([...element.querySelectorAll('button')].find(button => button.textContent?.includes('Tasks per day')) as HTMLButtonElement).click(); });
    await editor.$eval('gg-events .events-scheduling-settings', element => {
        const label = [...element.querySelectorAll('label')].find(label => label.textContent?.trim() === 'Balance events')!;
        label.querySelector('input')!.click();
    });
    await editor.waitForSelector('[aria-label="Balanced event plan"]');
    assert.ok(await editor.$eval('.event-summary-stats', element => [...element.children].some(child => child.textContent?.includes('Tasks per day') && child.querySelector('strong')?.textContent === '2')));
    const placements = () => editor.$$eval('.calendar-event', elements => elements.map(element => ({ title: element.querySelector('a')?.textContent, day: element.closest('td')!.querySelector('time')!.getAttribute('datetime') })));
    const planned = await placements();
    assert.equal(planned.length, 6);
    const balanceProgress = editor.waitForResponse(response => response.url().endsWith('/api/me/progress') && response.request().method() === 'PATCH');
    await editor.click('.calendar-event input'); assert.equal((await balanceProgress).status(), 200);
    assert.deepEqual(await placements(), planned);
    await editor.click('.event-day-button');
    await editor.waitForSelector('.event-day-dialog');
    await editor.click('[aria-label="Close day details"]:not(.event-panel-backdrop)');
    await editor.screenshot({ path: join(artifacts, 'balanced-events-desktop.png'), fullPage: true });
    await editor.click('.events-backlog-button');
    await editor.waitForSelector('.event-backlog');
    const pinDate = localDate(new Date(balanceStart.getFullYear(), balanceStart.getMonth(), balanceStart.getDate() + 3));
    await editor.$eval('.event-pin-controls input', (input, day) => { (input as HTMLInputElement).value = day; input.dispatchEvent(new Event('input', { bubbles: true })); }, pinDate);
    await editor.screenshot({ path: join(artifacts, 'event-backlog-desktop.png') });
    await clickButton(editor, 'Pin date', '.event-backlog');
    await editor.click('.event-backlog [aria-label="Close backlog"]');
    await editor.waitForSelector('.calendar-event input[aria-label="Mark Unscheduled objective event complete"]');
    const bulkCheckbox = '.calendar-event input[aria-label="Mark Unscheduled objective event complete"]';
    await editor.click(bulkCheckbox);
    await editor.waitForSelector('.event-confirm-dialog');
    const bulkProgress = editor.waitForResponse(response => response.url().endsWith('/api/me/progress') && response.request().method() === 'PATCH');
    await clickButton(editor, 'Complete objectives', '.event-confirm-dialog');
    assert.equal((await bulkProgress).status(), 200);
    const bulkState = await (await api('/api/me/progress', editorToken)).json() as { state: Record<string, { completed: boolean; storyRowCompletion: Record<string, boolean> }> };
    assert.equal(bulkState.state['genshin/balance-backlog'].completed, true);
    assert.deepEqual(bulkState.state['genshin/balance-backlog'].storyRowCompletion, { 'required-one': true, 'required-two': true });
    const afterBulk = await placements();
    assert.equal(afterBulk.find(item => item.title === 'Unscheduled objective event')?.day, pinDate);
    await editor.reload({ waitUntil: 'networkidle' });
    await clickButton(editor, 'Rebalance', 'gg-events');
    assert.equal((await placements()).find(item => item.title === 'Unscheduled objective event')?.day, pinDate);
    await editor.setViewportSize({ width: 390, height: 844 });
    assert.equal(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await editor.screenshot({ path: join(artifacts, 'balanced-events-mobile.png'), fullPage: true });
    await editor.setViewportSize({ width: 1440, height: 1000 });
    await clickButton(editor, 'List', 'gg-events');
    await editor.waitForSelector('.event-list-group[data-group="genshin"][open]');
    assert.equal(await editor.$$eval('.event-list-group[data-group="genshin"] .event-completion input', inputs =>
        inputs.some(input => (input as HTMLInputElement).checked) && inputs.some(input => !(input as HTMLInputElement).checked)), true);
    await editor.click('.event-list-overview button.is-success');
    await editor.waitForSelector('.event-list-group[data-group="genshin"][open]');
    await editor.waitForFunction(() => {
        const inputs = [...document.querySelectorAll<HTMLInputElement>('.event-list-group .event-completion input')];
        return inputs.length > 0 && inputs.every(input => input.checked);
    });
    await editor.screenshot({ path: join(artifacts, 'event-groups-completed-desktop.png'), fullPage: true });
    await clickButton(editor, 'Show all events', 'gg-events');
    await clickButton(editor, 'Calendar', 'gg-events');
    await editor.selectOption('[aria-label="Filter events by game"]', 'hsr');
    assert.equal(await editor.$eval('[aria-label="Filter events by game"]', element => (element as HTMLSelectElement).value), 'hsr');
    assert.ok(await editor.$('gg-workspace-sidebar a[href="/events"].active'));
    await editor.setViewportSize({ width: 390, height: 844 });
    assert.equal(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await editor.screenshot({ path: join(artifacts, 'global-events-mobile.png'), fullPage: true });
    await editor.setViewportSize({ width: 1440, height: 1000 });
    const afterBalance = await repository.read('genshin');
    assert.equal((await update(editorToken, afterBalance.revision, beforeBalance.entries)).status, 200);
    console.log('PASS balanced calendar keeps assignments stable, preserves manual pins after reload, and confirms required-objective completion without changing optional objectives.');
    console.log('PASS global events calendar route, game filter, sidebar access and mobile layout.');

    // Verify every extracted page can load its own deferred bundle through existing URLs.
    for (const [route, selector] of [
        ['/dashboard', 'gg-dashboard [aria-label="Workspace summary"] .summary-card'],
        ['/games', 'gg-game-library gg-game-card'],
        ['/games/genshin/dashboard', 'gg-game-dashboard [aria-label="Game summary"] .summary-card'],
        ['/settings?tab=data', 'gg-settings .settings'],
        ['/games/genshin/plans', 'gg-progression .collection-empty'],
        ['/games/genshin/characters', 'gg-characters'],
        ['/games/genshin/inventory', 'gg-inventory'],
        ['/games/genshin/teams', 'gg-teams'],
        ['/games/genshin/events', 'gg-events'],
        ['/games/genshin/achievements', 'gg-achievements'],
    ]) {
        await editor.goto(origin + route, { waitUntil: 'networkidle' });
        await editor.waitForSelector(selector!);
    }
    console.log('PASS global and game feature pages load through their existing routes.');

    const beforeDashboard = await repository.read('genshin');
    const today = new Date();
    const dashboardDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await repository.write('genshin', [...beforeDashboard.entries, ...Array.from({ length: 24 }, (_, index): CatalogEntry => ({
        ...baseEntry, id: `dashboard-daily-${index}`, kind: 'events', name: `Dashboard daily ${index + 1}`, category: 'daily',
        eventType: 'daily', startDate: dashboardDay, endDate: dashboardDay,
    }))], beforeDashboard.revision);
    const dashboardRequests: string[] = [];
    const dashboardRequest = (request: { url(): string }) => {dashboardRequests.push(new URL(request.url()).pathname);};
    editor.on('request', dashboardRequest);
    await editor.goto(origin + '/dashboard', { waitUntil: 'networkidle' });
    await editor.waitForSelector('gg-dashboard .continue-card');
    assert.equal(await editor.$$eval('gg-dashboard .continue-card', cards => cards.length <= 4), true);
    assert.equal(await editor.$('gg-dashboard .worlds-panel, gg-dashboard .story-panel, gg-dashboard .quick-actions'), null);
    assert.equal(dashboardRequests.includes('/api/games'), false, 'Dashboards must not retrieve the full game catalog.');
    assert.ok(dashboardRequests.includes('/api/dashboard/summary'));
    assert.ok(dashboardRequests.includes('/api/dashboard/events'));
    assert.equal(await editor.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true, 'Desktop dashboard fits the available screen height.');
    assert.equal(await editor.$eval('gg-dashboard .events-panel', panel => {
        const content = panel.querySelector('.section-content')!, checkbox = panel.querySelector('input')!;
        const bounds = content.getBoundingClientRect(), first = checkbox.getBoundingClientRect();
        return content.scrollHeight > content.clientHeight && first.top >= bounds.top && first.bottom <= bounds.bottom;
    }), true, 'The task panel scrolls internally and its first task remains visible alongside deadlines.');
    const requestCount = dashboardRequests.length;
    await editor.evaluate(async () => {window.dispatchEvent(new Event('focus')); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));});
    assert.equal(dashboardRequests.length, requestCount, 'Returning to the tab does not reload dashboard widgets.');
    const gameTaskToggle = 'gg-dashboard .events-panel .task-game-toggle';
    await editor.click(gameTaskToggle);
    await editor.waitForFunction(() => {
        const group = document.querySelector('gg-dashboard .events-panel .task-group-collapse');
        return group?.hasAttribute('inert') && group.getBoundingClientRect().height < 1;
    });
    assert.equal(await editor.getAttribute(gameTaskToggle, 'aria-expanded'), 'false');
    await editor.click(gameTaskToggle);
    await editor.waitForFunction(() => document.querySelector('gg-dashboard .events-panel .task-group-collapse')?.getBoundingClientRect().height! > 40);
    assert.equal(await editor.getAttribute(gameTaskToggle, 'aria-expanded'), 'true');
    editor.off('request', dashboardRequest);
    await editor.screenshot({ path: join(artifacts, 'dashboard-global-desktop.png'), fullPage: true });
    await editor.setViewportSize({ width: 390, height: 844 });
    assert.equal(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await editor.$eval('.continue-games', target => getComputedStyle(target).gridTemplateColumns.split(' ').length), 1);
    await editor.screenshot({ path: join(artifacts, 'dashboard-global-mobile.png'), fullPage: true });
    await editor.setViewportSize({ width: 1440, height: 1000 });
    await editor.goto(origin + '/games/genshin/dashboard', { waitUntil: 'networkidle' });
    await editor.waitForSelector('gg-dashboard .game-header');
    assert.ok(await editor.$('gg-dashboard .continue-story'));
    assert.equal(await editor.$('gg-dashboard #continue-playing'), null);
    assert.equal(await editor.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true, 'Game dashboard uses internal panel scrolling on desktop.');
    assert.equal(await editor.$eval('gg-game-dashboard .events-panel .section-content', content => content.scrollHeight > content.clientHeight), true, 'Long game task lists scroll inside their widget.');
    assert.equal(await editor.$eval('gg-game-dashboard .active-events', panel => panel.getBoundingClientRect().bottom <= innerHeight), true, 'Active Events remains visible below long task lists.');
    assert.ok(await editor.$('gg-game-dashboard .settings-button'));
    assert.equal(await editor.$eval('gg-game-dashboard .game-header', header => header.getBoundingClientRect().height <= 140), true);
    assert.equal(await editor.$('gg-game-dashboard [aria-label="Patch Overview"]'), null);
    assert.equal(await editor.$$eval('gg-game-dashboard .active-events .event-row', rows => rows.length), 0, 'Routine daily tasks are not duplicated in Active Events.');
    await editor.click('gg-game-dashboard .events-panel .dashboard-event-completion');
    await editor.waitForFunction(() => document.querySelector('gg-game-dashboard .events-panel details summary')?.textContent?.includes('(1)'));
    await editor.click('gg-game-dashboard .events-panel details summary');
    await editor.click('gg-game-dashboard .events-panel details .dashboard-event-completion');
    await editor.waitForFunction(() => !document.querySelector('gg-game-dashboard .events-panel details'));
    await editor.evaluate(() => {document.querySelectorAll('gg-game-dashboard .widget-column').forEach(column => {column.scrollTop = 0;});});
    await editor.screenshot({ path: join(artifacts, 'dashboard-game-desktop.png'), fullPage: true });
    await editor.setViewportSize({ width: 390, height: 844 });
    assert.equal(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Game dashboard fits mobile without horizontal overflow.');
    await editor.screenshot({ path: join(artifacts, 'dashboard-game-mobile.png'), fullPage: true });
    await editor.setViewportSize({ width: 1440, height: 1000 });
    console.log('PASS dashboard scoping, lightweight APIs, bounded Continue Playing cards, and responsive global/game layouts.');
    const afterDashboard = await repository.read('genshin');
    await repository.write('genshin', beforeDashboard.entries, afterDashboard.revision);

    const beforeInventory = await repository.read('genshin');
    const inventoryRules: CharacterRules = { levelCap: 100, rarities: [5], weaponTypes: ['Sword'], damageTypes: ['Physical'], roles: [], equipmentSlots: [], progressionTracks: [] };
    const inventoryCharacters: CatalogEntry[] = Array.from({ length: 30 }, (_, index) => ({ ...baseEntry, id: `inventory-character-${index}`, kind: 'characters', name: `Inventory Character ${String(index + 1).padStart(2, '0')}`, rarity: 5,
        characterDefinition: { ...emptyCharacterDefinition(), weaponType: 'Sword', damageType: 'Physical', headshot: image.url, skills:[{id:'attack',name:'Configured attack',description:'Synthetic progression fixture',maxLevel:5}],guides:[{title:'Fixture build guide',url:'https://example.com/build-guide'}] } }));
    await repository.write('genshin', [...beforeInventory.entries, ...inventoryCharacters], beforeInventory.revision, inventoryRules);
    await player.goto(origin + '/games/genshin/characters', { waitUntil: 'networkidle' });
    await player.waitForSelector('gg-characters h1'); assert.equal(await player.$('gg-characters .character-manage'), null);
    await player.$$eval('.collection-tabs button', buttons => (buttons[1] as HTMLButtonElement).click());
    await player.waitForSelector('gg-character-card .character-ownership');
    await player.waitForFunction(() => document.querySelectorAll('gg-character-card').length === 24);
    assert.equal(await player.$$('gg-character-card').then(cards => cards.length), 24);
    const addCharacter = player.waitForResponse(response => response.url().endsWith('/api/me/progress') && response.request().method() === 'PATCH');
    await player.click('[aria-label="Add Inventory Character 01 to collection"]'); assert.equal((await addCharacter).status(), 200);
    assert.equal(await player.$('gg-characters [role="dialog"]'), null);
    const inventoryProgress = await (await api('/api/me/progress', playerToken)).json() as { revision: number; state: Record<string, unknown> };
    assert.equal((await api('/api/me/progress', playerToken, 'PATCH', { revision: inventoryProgress.revision, changes: { 'genshin/inventory-character-0': { completed: false, quantity: 0, target: 0, characterCollection: { ...emptyCharacterCollection(), level: 60, target: { level: 100, gear: {}, progression: {} } } } } })).status, 200);
    await player.reload({ waitUntil: 'networkidle' }); await player.waitForSelector('gg-character-card');
    assert.ok(await player.$eval('gg-character-card', card => card.textContent?.includes('Lv. 60') && card.textContent.includes('Target 100')));
    await player.click('gg-character-card .character-card');
    await player.waitForSelector('gg-character-details .details-layout');
    assert.equal(await player.$eval('gg-character-details',dialog => {
        const planner = dialog.querySelector('.details-planner')!.getBoundingClientRect(), resources = dialog.querySelector('.details-sidebar')!.getBoundingClientRect(), modal = dialog.querySelector('.modal')!.getBoundingClientRect();
        return resources.left >= planner.right - 1 && resources.right <= modal.right + 1 && resources.top >= modal.top;
    }),true,'Character resources must occupy the right dialog column, not inherit the application navigation position.');
    await player.$eval('gg-character-details [aria-label="Target Character level"]',field => {const input = field as HTMLInputElement;input.value = '80';input.dispatchEvent(new Event('input',{bubbles:true}));});
    await player.$eval('gg-character-details .resource-group',group => {(group as HTMLDetailsElement).open = true;});
    await clickButton(player,'Skills','gg-character-details');
    await player.waitForSelector('gg-character-details .details-skill');
    await clickButton(player,'Level & Promotion','gg-character-details');
    await player.waitForSelector('gg-character-details [aria-label="Target Character level"]');
    assert.equal(await player.$eval('gg-character-details [aria-label="Target Character level"]',field => (field as HTMLInputElement).value),'80');
    assert.equal(await player.$eval('gg-character-details .resource-group',group => (group as HTMLDetailsElement).open),true);
    await clickButton(player,'Mark Goal Complete','gg-character-details');
    await player.waitForFunction(() => document.querySelector('gg-character-details')?.textContent?.includes('Reopen Goal'));
    await player.click('gg-character-details .details-favorite');
    await player.screenshot({path:join(artifacts,'character-details-desktop.png')});
    await player.setViewportSize({width:390,height:844});
    assert.equal(await player.$eval('gg-character-details .modal',modal => modal.scrollWidth <= modal.clientWidth + 1),true);
    await player.screenshot({path:join(artifacts,'character-details-mobile.png')});
    const saveDetails = player.waitForResponse(response => response.url().endsWith('/api/me/progress') && response.request().method() === 'PATCH');
    await clickButton(player,'Save development plan','gg-character-details');assert.equal((await saveDetails).status(),200);
    await player.waitForFunction(() => document.querySelector('gg-character-details .details-footer')?.textContent?.includes('Saved progression'));
    await clickButton(player,'Close','gg-character-details');await player.waitForSelector('gg-character-details',{state:'hidden'});
    await player.reload({waitUntil:'networkidle'});await player.waitForSelector('gg-character-card');
    await player.click('gg-character-card .character-card');await player.waitForSelector('gg-character-details .details-layout');
    assert.equal(await player.$eval('gg-character-details [aria-label="Current Character level"]',field => (field as HTMLInputElement).value),'60');
    assert.equal(await player.$eval('gg-character-details [aria-label="Target Character level"]',field => (field as HTMLInputElement).value),'80');
    assert.equal(await player.$eval('gg-character-details .details-favorite',button => button.getAttribute('aria-pressed')),'true');
    assert.ok(await player.$eval('gg-character-details',dialog => dialog.textContent?.includes('Reopen Goal')));
    await clickButton(player,'Close','gg-character-details');await player.waitForSelector('gg-character-details',{state:'hidden'});
    await player.setViewportSize({width:1440,height:1000});
    console.log('PASS configurable character details: tabs and resources preserve drafts, goal completion stays separate from current level, favorites and targets survive reload, mobile layout fits.');
    await player.$$eval('.collection-tabs button', buttons => (buttons[1] as HTMLButtonElement).click());
    await player.waitForFunction(() => document.querySelectorAll('gg-character-card').length === 24);
    await player.screenshot({ path: join(artifacts, 'character-inventory-desktop.png'), fullPage: true });
    await player.click('.character-view-toggle button:last-child');
    await player.waitForSelector('.character-list');
    await player.screenshot({ path: join(artifacts, 'character-inventory-list.png') });
    await player.click('.character-view-toggle button:first-child');
    await player.waitForSelector('.character-grid:not(.character-list)');
    await player.$eval('[aria-label="Characters per page"]', select => { const field = select as HTMLSelectElement; field.value = [...field.options].find(option => option.textContent === '12')!.value; field.dispatchEvent(new Event('change', { bubbles: true })); });
    await player.waitForFunction(() => document.querySelectorAll('gg-character-card').length === 12);
    await player.click('[aria-label="Next character page"]');
    await player.waitForFunction(() => document.querySelector('.character-pagination')?.textContent?.replace(/\s/g, '').includes('Showing13–24of30characters'));
    await player.setViewportSize({ width: 390, height: 900 });
    await player.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await player.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await player.$$eval('gg-character-card .character-portrait img', images => images.every(image => { const box = image.getBoundingClientRect(); return Math.abs(box.width - box.height) < 1; })), true);
    await player.screenshot({ path: join(artifacts, 'character-inventory-mobile.png') });
    await player.setViewportSize({ width: 1440, height: 1000 });
    await editor.goto(origin + '/games/genshin/characters', { waitUntil: 'networkidle' });
    await editor.waitForSelector('.character-manage');
    assert.equal(await editor.$$('gg-character-card').then(cards => cards.length), 0, 'Character ownership is isolated per account');
    await editor.click('.character-manage summary');
    await clickButton(editor, 'Game rules', 'gg-characters');
    await editor.waitForSelector('gg-game-rules-editor .section-editor-workspace');
    await editor.waitForFunction(() => document.querySelector('gg-game-rules-editor h3')?.textContent === 'General');
    await editor.bringToFront();
    await editor.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    await editor.type('gg-game-rules-editor textarea', 'Browser-tested shared rules');
    await editor.keyboard.press('Tab');
    await clickButton(editor, 'Attributes', 'gg-game-rules-editor');
    await editor.waitForFunction(() => document.querySelector('gg-game-rules-editor h3')?.textContent === 'Attributes');
    await clickButton(editor, '+ Add Attribute', 'gg-game-rules-editor');
    await editor.waitForSelector('gg-game-rules-editor .rules-row');
    await editor.click('gg-game-rules-editor .rules-row summary');
    await editor.screenshot({path: join(artifacts, 'character-rules-desktop.png')});
    await editor.setViewportSize({width: 390, height: 844});
    assert.equal(await editor.$eval('gg-game-rules-editor .modal', modal => modal.scrollWidth <= modal.clientWidth + 1), true);
    await editor.screenshot({path: join(artifacts, 'character-rules-mobile.png')});
    await clickButton(editor, 'Cancel', 'gg-game-rules-editor');
    await editor.waitForSelector('gg-game-rules-editor .discard-prompt');
    await clickButton(editor, 'Discard changes', 'gg-game-rules-editor');
    await editor.waitForSelector('gg-game-rules-editor', { state: 'hidden' });
    assert.equal((await repository.read('genshin')).characterRules?.attributes, globalThis.undefined, 'Cancelled rules remain local');
    await editor.setViewportSize({width: 1440, height: 1000});
    await editor.click('.character-manage summary');
    await clickButton(editor, 'Game rules', 'gg-characters');
    await editor.waitForSelector('gg-game-rules-editor textarea');
    await editor.bringToFront();
    await editor.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    await editor.type('gg-game-rules-editor textarea', 'Browser-tested shared rules');
    await editor.keyboard.press('Tab');
    await editor.waitForFunction(() => (document.querySelector('gg-game-rules-editor textarea') as HTMLTextAreaElement)?.value === 'Browser-tested shared rules');
    await clickButton(editor, 'Save Rules', 'gg-game-rules-editor');
    await editor.waitForSelector('gg-game-rules-editor', { state: 'hidden' });
    assert.equal((await repository.read('genshin')).characterRules?.description, 'Browser-tested shared rules');
    await editor.reload({waitUntil: 'networkidle'});
    await editor.click('.character-manage summary'); await clickButton(editor, 'Game rules', 'gg-characters');
    await editor.waitForSelector('gg-game-rules-editor textarea');
    assert.equal(await editor.$eval('gg-game-rules-editor textarea', field => (field as HTMLTextAreaElement).value), 'Browser-tested shared rules');
    await clickButton(editor, 'Cancel', 'gg-game-rules-editor');
    await editor.waitForSelector('gg-game-rules-editor', { state: 'hidden' });
    console.log('PASS shared game rules editor: Story Guide shell, inline attributes, responsive layout, dirty cancellation and persisted rules after reload.');
    const beforeEquipment = await repository.read('genshin');
    const equipmentRules:CharacterRules = {...beforeEquipment.characterRules!,equipmentSlots:[{id:'weapon',label:'Weapon',system:'weapon',allowedTypes:['sword'],limit:1}]};
    const equipmentCatalog:CatalogEntry[] = [
        {...baseEntry,id:'e2e-ore',kind:'inventory',name:'Fixture ore'},
        {...baseEntry,id:'e2e-sword',kind:'inventory',name:'Fixture sword',equipmentDefinition:{typeId:'sword',weaponType:'Sword',progressionTracks:[{id:'level',label:'Weapon level',type:'level',minValue:1,maxValue:2,displayOrder:0,upgradeCosts:[{fromValue:1,toValue:2,materials:[{itemId:'e2e-ore',quantity:7}]}]}]}},
    ];
    await repository.write('genshin',[...beforeEquipment.entries,...equipmentCatalog],beforeEquipment.revision,equipmentRules);
    const beforeCopies = await (await api('/api/me/progress',playerToken)).json() as {revision:number};
    assert.equal((await api('/api/me/progress',playerToken,'PATCH',{revision:beforeCopies.revision,changes:{'genshin/e2e-ore':{completed:false,quantity:3,target:0},'genshin/e2e-sword':{completed:false,quantity:1,target:0}}})).status,200);
    await player.goto(origin + '/games/genshin/characters',{waitUntil:'networkidle'});await player.waitForSelector('gg-character-card');
    await player.click('gg-character-card .character-card');await player.waitForSelector('gg-character-details .details-tabs');
    await clickButton(player,'Weapon','gg-character-details');await player.waitForSelector('.details-equipment-selector select');
    await player.selectOption('.details-equipment-selector select','new:e2e-sword');
    await player.waitForSelector('gg-character-details [aria-label="Target Weapon level"]');
    await player.$eval('gg-character-details [aria-label="Target Weapon level"]',field => {const input = field as HTMLInputElement;input.value = '2';input.dispatchEvent(new Event('input',{bubbles:true}));});
    await player.waitForFunction(() => document.querySelector('gg-character-details .details-material-grid')?.textContent?.includes('Fixture ore'));
    const saveEquipment = player.waitForResponse(response => response.url().endsWith('/api/me/progress') && response.request().method() === 'PATCH');
    await clickButton(player,'Save development plan','gg-character-details');assert.equal((await saveEquipment).status(),200);
    await player.waitForFunction(() => document.querySelector('gg-character-details .details-footer')?.textContent?.includes('Saved progression'));
    await player.reload({waitUntil:'networkidle'});await player.waitForSelector('gg-character-card');await player.click('gg-character-card .character-card');
    await player.waitForSelector('gg-character-details .details-tabs');await clickButton(player,'Weapon','gg-character-details');await player.waitForSelector('gg-character-details [aria-label="Target Weapon level"]');
    assert.equal(await player.$eval('gg-character-details [aria-label="Current Weapon level"]',field => (field as HTMLInputElement).value),'1');
    assert.equal(await player.$eval('gg-character-details [aria-label="Target Weapon level"]',field => (field as HTMLInputElement).value),'2');
    await player.screenshot({path:join(artifacts,'character-details-equipment.png')});
    await player.selectOption('.details-equipment-selector select','');
    const unequip = player.waitForResponse(response => response.url().endsWith('/api/me/progress') && response.request().method() === 'PATCH');
    await clickButton(player,'Save development plan','gg-character-details');assert.equal((await unequip).status(),200);
    const copies = await (await api('/api/me/progress',playerToken)).json() as {state:Record<string,{equipmentInstances?:{target?:{level:number}}[]}>};
    assert.equal(copies.state['genshin/e2e-sword'].equipmentInstances?.length,1);assert.equal(copies.state['genshin/e2e-sword'].equipmentInstances?.[0].target?.level,2);
    console.log('PASS owned equipment copies: atomic assignment/progression persistence, configured material costs, reload restoration and unequip without deleting the inventory copy.');
    const afterInventory = await repository.read('genshin');
    // This is the disposable test database: restore its fixture rules before removing test-only slots.
    // Production writes still require migration for destructive rules changes.
    await collection.updateOne({name:'Genshin Impact'},{$set:{characterRules:beforeInventory.characterRules ?? inventoryRules}});
    await repository.write('genshin', beforeInventory.entries, afterInventory.revision, beforeInventory.characterRules);
    if (!beforeInventory.characterRules) {await collection.updateOne({ name: 'Genshin Impact' }, { $unset: { characterRules: '' } });}
    await editor.goto(origin + '/games/genshin/achievements', { waitUntil: 'networkidle' });
    console.log('PASS reusable character inventory: catalog ownership, account persistence/isolation, current and target levels, grid/list, pagination, square images and mobile layout.');

    const libraryRequests: string[] = [];
    editor.on('request',request=>{if(request.url().startsWith(origin+'/api/')) libraryRequests.push(new URL(request.url()).pathname);});
    await editor.goto(origin+'/library',{waitUntil:'networkidle'});
    await editor.waitForSelector('gg-game-library gg-game-card');
    assert.equal(await editor.$eval('.library-views [aria-current=page]',element=>element.textContent),'All Games');
    assert.equal(await editor.$$eval('.library-toolbar select',elements=>elements.every(element=>getComputedStyle(element).appearance==='none')),true);
    assert.equal(await editor.$eval('gg-game-card .menu-toggle',element=>{
        const button=element.getBoundingClientRect(),icon=element.querySelector('svg')!.getBoundingClientRect();
        return Math.abs(button.left+button.width/2-icon.left-icon.width/2)<1 && Math.abs(button.top+button.height/2-icon.top-icon.height/2)<1;
    }),true);
    await clickButton(editor,'List','gg-game-library .view-buttons');
    await editor.waitForSelector('gg-game-card article.list-card');
    await editor.setViewportSize({width:1965,height:1000});
    await editor.locator('.library-heading h1').hover();
    assert.equal(await editor.$$eval('gg-game-card article.list-card',elements=>elements.every(element=>element.getBoundingClientRect().height<=76)),true,'Desktop list rows stay compact despite global compact styles.');
    const rowBackground=await editor.$eval('gg-game-card article.list-card',element=>getComputedStyle(element).backgroundColor);
    await editor.locator('gg-game-card article.list-card').first().hover();
    await editor.waitForFunction(initial=>getComputedStyle(document.querySelector('gg-game-card article.list-card')!).backgroundColor!==initial,rowBackground);
    await editor.screenshot({path:join(artifacts,'game-library-list-desktop.png')});
    await editor.setViewportSize({width:1440,height:1000});
    await clickButton(editor,'Grid','gg-game-library .view-buttons');
    await editor.waitForSelector('gg-game-card article:not(.list-card)');
    assert.ok(libraryRequests.includes('/api/games/library'));
    assert.equal(libraryRequests.includes('/api/games'),false,'Library metadata must not load every game catalog.');
    assert.equal(await editor.$('gg-workspace-sidebar .game-list'),null);
    await editor.click('[aria-label="Actions for Honkai: Star Rail"]');
    const favoriteSaved=editor.waitForResponse(response=>response.url().endsWith('/api/me/game-library') && response.request().method()==='PUT');
    await clickButton(editor,'Add to Favorites','.game-context-menu');
    await favoriteSaved;
    await editor.click('[aria-label="Actions for Honkai: Star Rail"]');
    await clickButton(editor,'Pin to Sidebar','.game-context-menu');
    await editor.waitForSelector('gg-workspace-sidebar [aria-label="Pinned games"] a');
    await clickButton(editor,'Manage Collections','gg-game-library');
    await clickButton(editor,'+ Add Collection','.library-dialog');
    await editor.locator('[aria-label="Collection name"]').fill('Currently Playing');
    await clickButton(editor,'Save Collections','.library-dialog');
    await editor.waitForSelector('.library-dialog',{state:'hidden'});
    await editor.click('[aria-label="Actions for Honkai: Star Rail"]');
    await clickButton(editor,'Add to Collection','.game-context-menu');
    const membershipSaved=editor.waitForResponse(response=>response.url().endsWith('/api/me/game-library') && response.request().method()==='PUT');
    await editor.locator('.membership-choice input').check();
    await membershipSaved;
    await clickButton(editor,'Done','.membership');
    await editor.waitForFunction(()=>!document.querySelector('.membership'));
    await editor.screenshot({path:join(artifacts,'game-library-desktop.png')});
    await editor.reload({waitUntil:'networkidle'});
    await editor.waitForSelector('gg-workspace-sidebar [aria-label="Pinned games"] a');
    const personal=await (await api('/api/me/game-library',editorToken)).json();
    assert.ok(personal.games.some((game:{gameId:string;isFavorite:boolean;isPinned:boolean})=>game.gameId==='hsr'&&game.isFavorite&&game.isPinned));
    assert.deepEqual(personal.collections[0].gameIds,['hsr']);
    assert.deepEqual((await (await api('/api/me/game-library',playerToken)).json()).collections,[],'Collections are account isolated.');
    await editor.goto(origin+'/games/genshin/story',{waitUntil:'networkidle'});
    await editor.bringToFront();
    const previousRoute=editor.url();
    await editor.keyboard.press('Control+k');
    await editor.waitForSelector('gg-game-switcher input');
    const switcherLayout=()=>editor.$eval('gg-game-switcher section',element=>{
        const dialog=element.getBoundingClientRect(),header=element.querySelector('header')!.getBoundingClientRect(),footer=element.querySelector('footer')!.getBoundingClientRect();
        return {height:dialog.height,top:dialog.top,width:dialog.width,headerTop:header.top,footerBottom:footer.bottom};
    });
    const unfilteredLayout=await switcherLayout();
    await editor.locator('gg-game-switcher input').fill('no-matching-game-xyz');
    await editor.waitForFunction(()=>document.querySelector('#game-switch-results')?.textContent?.includes('No games found.'));
    assert.deepEqual(await switcherLayout(),unfilteredLayout,'Filtering to no games keeps the dialog and its header/footer stationary.');
    await editor.locator('gg-game-switcher input').fill('star rail');
    await editor.waitForFunction(()=>document.querySelectorAll('gg-game-switcher [role=option]').length===1);
    assert.deepEqual(await switcherLayout(),unfilteredLayout,'A single result keeps the same dialog dimensions.');
    await editor.screenshot({path:join(artifacts,'game-switcher-filtered-desktop.png')});
    await editor.keyboard.press('Escape');assert.equal(editor.url(),previousRoute);
    await editor.keyboard.press('Control+k');await editor.locator('gg-game-switcher input').fill('hsr');
    await editor.waitForFunction(()=>document.querySelectorAll('gg-game-switcher [role=option]').length===1);
    await editor.locator('gg-game-switcher input').press('Enter');await editor.waitForFunction(()=>location.pathname==='/games/hsr/story');
    await editor.waitForSelector('gg-workspace-sidebar a[href="/games/hsr/story"]');
    await editor.setViewportSize({width:390,height:844});
    await editor.keyboard.press('Control+k');await editor.waitForSelector('gg-game-switcher input');
    assert.equal(await editor.$eval('gg-game-switcher section',element=>element.getBoundingClientRect().right<=innerWidth),true);
    assert.equal(await editor.$eval('gg-game-switcher .modal-backdrop',element=>getComputedStyle(element).position),'fixed');
    assert.equal(await editor.$eval('gg-game-switcher section',element=>{const bounds=element.getBoundingClientRect();return bounds.top>=0 && bounds.bottom<=innerHeight && getComputedStyle(element).backgroundColor!=='rgba(0, 0, 0, 0)';}),true);
    await editor.screenshot({path:join(artifacts,'game-switcher-mobile.png')});
    await editor.locator('gg-game-switcher footer button').press('Enter');
    await editor.waitForSelector('gg-game-switcher [role=dialog]',{state:'hidden'});
    await editor.setViewportSize({width:1440,height:1000});
    console.log('PASS scalable library: lightweight metadata, favorites, pins, collections, account isolation and feature-aware keyboard switching.');

    const customId = 'e2e-custom-rpg';
    assert.equal((await api('/api/games/registry')).status, 401);
    assert.equal((await api('/api/games/registry', playerToken)).status, 403);
    assert.equal((await api('/api/games', playerToken, 'POST', defaultGameOverview(customId))).status, 403);
    await guest.goto(origin+'/library',{waitUntil:'networkidle'});
    await guest.waitForSelector('gg-game-library');
    assert.equal(await guest.$('gg-game-library .library-actions .primary'),null);
    await editor.goto(origin+'/library/manage',{waitUntil:'networkidle'});
    await editor.waitForSelector('gg-game-library');
    await clickButton(editor,'+ Add Game','gg-game-library');
    await editor.waitForSelector('gg-game-manager input[name=game-title]');
    const fillGame = async (name: string, value: string) => editor.$eval(`gg-game-manager [name=${name}]`, (element, value) => {
        const input = element as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    await fillGame('game-title', 'E2E Custom RPG');
    await fillGame('game-type', 'JRPG, RPG');
    await fillGame('game-description', 'A configurable game overview.');
    await clickButton(editor, 'Features', 'gg-game-manager');
    await editor.waitForSelector('#game-features-panel:not([hidden])');
    await editor.$$eval('gg-game-manager .game-feature', labels => {
        (labels.find(label => label.querySelector('strong')?.textContent === 'Events')?.querySelector('input') as HTMLInputElement).click();
    });
    await editor.screenshot({ path: join(artifacts, 'game-features-desktop.png') });
    const dialogLayout = async () => editor.$eval('gg-game-manager .game-editor', element => {
        const panel = element.getBoundingClientRect();
        const footer = element.querySelector('.game-manager-footer')!.getBoundingClientRect();
        return { height: panel.height, footerBottom: footer.bottom, visible: footer.bottom <= innerHeight && footer.top >= panel.top && footer.bottom <= panel.bottom };
    });
    const fixedLayout = await dialogLayout();
    assert.equal(fixedLayout.visible, true, 'Game actions remain visible below scrolling content');
    for (const tab of ['Advanced', 'Overview', 'Features']) {
        await clickButton(editor, tab, 'gg-game-manager');
        const layout = await dialogLayout();
        assert.equal(layout.height, fixedLayout.height, 'Changing tabs preserves dialog height');
        assert.equal(layout.footerBottom, fixedLayout.footerBottom, 'Changing tabs preserves action placement');
        await editor.$eval('gg-game-manager .game-editor-content', element => {element.scrollTop = element.scrollHeight;});
        assert.equal((await dialogLayout()).footerBottom, fixedLayout.footerBottom, 'Scrolling fields leaves actions fixed');
    }
    const featuresViewport = editor.viewportSize()!;
    await editor.setViewportSize({ width: 390, height: 844 });
    await editor.screenshot({ path: join(artifacts, 'game-features-mobile.png') });
    assert.equal(await editor.$eval('gg-game-manager', element => element.scrollWidth <= innerWidth), true);
    assert.equal((await dialogLayout()).visible, true, 'Game actions remain visible on mobile');
    await editor.setViewportSize(featuresViewport);
    await clickButton(editor, 'Overview', 'gg-game-manager');
    let draftUploads = 0;
    editor.on('request', request => {if (request.url().includes(`/api/games/${customId}/images`) && request.method() === 'POST') {draftUploads++;}});
    const draftFiles = await editor.$$('gg-game-manager input[type=file]');
    assert.equal(draftFiles.length, 2);
    await draftFiles[0].setInputFiles(imagePath);
    await draftFiles[1].setInputFiles(imagePath);
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
    assert.deepEqual(createdOverview.genres,['JRPG','RPG']);
    assert.equal(createdOverview.color, 'rgba(51, 153, 255, 1)');
    assert.ok(createdOverview.icon && createdOverview.banner);
    await editor.click('[aria-label="Close game manager"]');
    await editor.waitForSelector('gg-game-manager [role=dialog]', { state: 'hidden' });
    const selectCustom = async () => {
        await editor.keyboard.press('Control+k');
        await editor.waitForFunction(() => [...document.querySelectorAll('gg-game-switcher [role=option]')].some(button => button.textContent?.includes('E2E')));
        await editor.$$eval('gg-game-switcher [role=option]', buttons => (buttons.find(button => button.textContent?.includes('E2E')) as HTMLButtonElement).click());
        await editor.waitForFunction(id => location.pathname === `/games/${id}/dashboard`, customId, {});
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
    await editor.goto(origin + `/games/${customId}/story`, { waitUntil: 'networkidle' });
    await editor.waitForFunction(id => location.pathname === `/games/${id}/dashboard`, customId, {});
    await editor.waitForSelector('gg-game-dashboard .events-panel details summary');
    await editor.click('gg-game-dashboard .events-panel details summary');
    await editor.waitForSelector('gg-game-dashboard .dashboard-event-completion:checked');
    await editor.waitForSelector('[aria-label="Edit E2E Custom RPG overview"]');
    await editor.click('[aria-label="Edit E2E Custom RPG overview"]');
    await editor.waitForSelector('gg-game-manager input[name=game-title]');
    await fillGame('game-title', 'E2E Renamed RPG');
    const customUpload = editor.waitForResponse(response => response.url().includes(`/api/games/${customId}/images`) && response.request().method() === 'POST');
    const customIcon = await editor.$('gg-game-manager input[type=file]');
    assert.ok(customIcon);
    await customIcon.setInputFiles(imagePath);
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
    await clickButton(editor, 'Advanced', 'gg-game-manager');
    await editor.selectOption('gg-game-manager [name=game-visibility]', 'editors');
    await clickButton(editor, 'Save Changes', 'gg-game-manager');
    await editor.waitForSelector('gg-game-manager .game-registry-list');
    assert.equal((await api(`/api/games/${customId}`)).status, 200, 'Shared game data stays public.');
    assert.equal((await api(`/api/games/${customId}/workspace`)).status, 401);
    assert.equal((await api(`/api/games/${customId}/workspace`, playerToken)).status, 403);
    assert.equal((await api(`/api/games/${customId}/workspace`, editorToken)).status, 200);
    const storedGame = await db.collection('games').findOne({ gameId: customId });
    assert.equal(storedGame?.['content'].events.length, 1);
    assert.equal(storedGame?.['gameConfiguration'].visibility, 'editors');
    assert.equal(storedGame?.['_schemaVersion'], 3);
    assert.equal(storedGame?.['events'], globalThis.undefined);
    assert.equal((await (await api('/api/me/progress', editorToken)).json()).state[`${customId}/custom-event`].completed, true);
    await repository.initialize();
    assert.equal((await repository.read(customId)).overview?.visibility, 'editors');
    await guest.goto(origin + `/games/${customId}/dashboard`, { waitUntil: 'networkidle' });
    await guest.waitForFunction(() => location.pathname === '/games');
    assert.equal(await guest.$('gg-game-library a[href="/games/e2e-custom-rpg/dashboard"]'), null);
    await editor.click('[aria-label="Edit E2E Renamed RPG"]');
    await editor.waitForSelector('gg-game-manager input[name=game-title]');
    await clickButton(editor, 'Advanced', 'gg-game-manager');
    await editor.selectOption('gg-game-manager [name=game-visibility]', 'public');
    await clickButton(editor, 'Overview', 'gg-game-manager');
    await clickButton(editor, 'Features', 'gg-game-manager');
    await editor.locator('gg-game-manager [aria-label="Events Visibility"]').selectOption('editors');
    await clickButton(editor, 'Save Changes', 'gg-game-manager');
    await editor.waitForSelector('gg-game-manager .game-registry-list');
    assert.equal((await api(`/api/games/${customId}/workspace?feature=events`, playerToken)).status, 403);
    assert.equal((await api(`/api/games/${customId}/workspace?feature=events`, editorToken)).status, 200);
    assert.equal((await api(`/api/games/${customId}/workspace`)).status, 200);
    assert.equal((await api(`/api/games/${customId}/parsed`)).status, 200);
    await editor.click('[aria-label="Close game manager"]');
    await editor.waitForSelector('gg-game-manager', { state: 'hidden' });
    await editor.goto(origin + `/games/${customId}/dashboard`, { waitUntil: 'networkidle' });
    await editor.waitForSelector('gg-game-dashboard .events-panel details summary');
    await editor.click('gg-game-dashboard .events-panel details summary');
    await editor.waitForSelector('gg-game-dashboard .dashboard-event-completion:checked');
    const restoredGame = await repository.read(customId);
    assert.equal(restoredGame.name, 'E2E Renamed RPG');
    assert.ok(restoredGame.overview?.icon.startsWith(`/api/games/${customId}/images/`));
    assert.equal((await api(restoredGame.overview!.icon)).status, 200);
    console.log('PASS game configuration/content storage, editor-only game and feature workspaces, public shared data and retained account progress.');

    await editor.click('[popovertarget=profile-menu]');
    await Promise.all([
        editor.waitForNavigation({ waitUntil: 'networkidle' }),
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
    await expired.goto(origin + '/games/genshin/story', { waitUntil: 'networkidle' });
    await expired.waitForFunction(() => document.querySelector('gg-workspace .alert')?.textContent?.includes('Sign in again'));
    // The SDK swallows its initial checkSession error; the first application request then reports it.
    assert.equal(refreshAttempts, 2, 'Only SDK startup and the first application request should attempt the invalid token.');
    await expired.click('gg-workspace-sidebar a[href="/library"]');
    await expired.waitForFunction(() => location.pathname === '/library' && document.querySelector('gg-workspace .alert')?.textContent?.includes('Sign in again'));
    await expired.waitForLoadState('networkidle', { timeout: 5000 });
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
    for (const page of pages.filter(page => !page.isClosed())) {
        console.error('Browser layout at failure:', await page.evaluate(() => ({
            path: location.pathname, scrollY, viewport: innerHeight,
            headerBottom: document.querySelector('.story-header-expanded')?.getBoundingClientRect().bottom,
            toolbar: document.querySelector('.compact-story-toolbar')?.className,
        })).catch(() => null));
    }
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
