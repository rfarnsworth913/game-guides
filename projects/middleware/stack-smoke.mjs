import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';
import puppeteer from 'puppeteer';
import { checkStory } from './story-smoke.mjs';
import { checkPatch } from './patch-smoke.mjs';

async function freePort() {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    return port;
}
const uiPort = await freePort();
const apiPort = await freePort();
const collectionName = `middleware_test_${randomUUID().replaceAll('-', '')}`;
const base = `http://127.0.0.1:${uiPort}`;
const api = `http://127.0.0.1:${apiPort}`;
const rawSession = randomBytes(32).toString('base64url');
const sessionId = createHash('sha256').update(rawSession).digest('hex');
const csrf = randomBytes(32).toString('base64url');
const accountId = 'smoke-' + randomUUID();
let log = '';
const stack = spawn(process.execPath, ['projects/middleware/start.mjs'], {
    env: {
        ...process.env,
        UI_PORT: String(uiPort),
        MIDDLEWARE_PORT: String(apiPort),
        DB_COLLECTION: collectionName,
        APP_ORIGIN: base,
        OIDC_ISSUER: 'https://smoke-issuer.invalid',
        OIDC_CLIENT_ID: 'smoke-client',
        OIDC_CLIENT_SECRET: 'smoke-fixture-not-a-real-secret',
        OIDC_EDITOR_SUBJECTS: 'smoke-editor',
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});
stack.stdout.on('data', (chunk) => {
    log = (log + chunk).slice(-10000);
});
stack.stderr.on('data', (chunk) => {
    log = (log + chunk).slice(-10000);
});
let browser;
const client = new MongoClient(process.env.DB_CONN_STRING, { serverSelectionTimeoutMS: 5000 });
try {
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
        if (stack.exitCode !== null) {
            throw new Error(`Stack exited early: ${log}`);
        }
        try {
            ready = (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })).ok;
        } catch {
            /* startup */
        }
        if (ready) {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
    }
    assert.ok(ready, `Full-stack startup failed: ${log}`);
    await client.connect();
    const collection = client.db(process.env.DB_NAME).collection(collectionName);
    assert.equal(await collection.countDocuments(), 5);
    assert.equal(await collection.countDocuments({ name: 'Honkai Star Rail' }), 1);
    await collection.updateOne(
        { name: 'Genshin Impact' },
        {
            $set: {
                events: [{ title: 'Parser-owned event' }],
                version: { title: 'Parser version' },
            },
        },
    );
    // Migrate a real legacy catalog in the disposable collection, then verify idempotence.
    const legacyCategory = {
        id: 'old-category',
        game: 'hsr',
        kind: 'achievement-category',
        name: 'Legacy category',
        notes: '',
        category: '',
        rarity: 1,
        members: [],
        requirements: [],
        order: 0,
        day: '',
    };
    await collection.updateOne(
        { name: 'Honkai Star Rail' },
        {
            $set: {
                catalog: {
                    revision: 7,
                    achievementCategories: [legacyCategory],
                    achievements: [
                        {
                            ...legacyCategory,
                            id: 'old-achievement',
                            kind: 'achievements',
                            category: 'old-category',
                            name: 'Legacy achievement',
                            requirementText: 'Test requirement',
                        },
                    ],
                },
            },
            $unset: { _schemaVersion: '' },
        },
    );
    // The initial empty fixture backup is removed only inside this disposable test collection.
    const backups = client.db(process.env.DB_NAME).collection(`${collectionName}_schema_v1_backup`);
    await backups.deleteOne({ name: 'Honkai Star Rail' });
    async function runScript(script = 'projects/middleware/src/migrate.ts') {
        const child = spawn(process.execPath, ['--import', 'tsx', script], {
            env: { ...process.env, DB_COLLECTION: collectionName },
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        child.stdout.on('data', (chunk) => {
            output += chunk;
        });
        child.stderr.on('data', (chunk) => {
            output += chunk;
        });
        const code = await new Promise((resolve, reject) => {
            child.once('exit', resolve);
            child.once('error', reject);
        });
        assert.equal(code, 0, output);
    }
    await runScript();
    const migrated = await collection.findOne({ name: 'Honkai Star Rail' });
    assert.ok(!('catalog' in migrated));
    assert.equal(migrated._revision, 7);
    assert.equal(migrated.achievements[0].achievements[0]._id, 'old-achievement');
    assert.equal(migrated.achievements[0].achievements[0].requirements, 'Test requirement');
    assert.equal((await backups.findOne({ name: 'Honkai Star Rail' })).catalog.revision, 7);
    await runScript();
    assert.deepEqual(await collection.findOne({ name: 'Honkai Star Rail' }), migrated);
    await runScript('projects/middleware/parser-smoke.ts');
    browser = await puppeteer.launch({ headless: true });
    await client.db(process.env.DB_NAME).collection(collectionName + '_auth_sessions').insertOne({
        _id: sessionId, user: accountId, subject: 'smoke-editor', name: 'Smoke Editor', csrf,
        expiresAt: new Date(Date.now() + 3600000), idleAt: new Date(Date.now() + 3600000),
    });
    await browser.setCookie({ name: 'gg-local-session', value: rawSession, url: base, httpOnly: true, sameSite: 'Lax' });
    const page = await browser.newPage();
    const runtimeErrors = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    await page.goto(`${base}/games/genshin/achievements`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() =>
        document.querySelector('.device-status')?.textContent.includes('Database connected'),
    );
    // Seed shared definitions through an authenticated editor, then explicitly import guest state.
    const initial = await (await fetch(api + '/api/games/genshin')).json();
    const common = { game: 'genshin', notes: '', rarity: 0, members: [], requirements: [], order: 0, day: '' };
    const seeded = await fetch(api + '/api/games/genshin/catalog', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: 'gg-local-session=' + rawSession, 'X-CSRF-Token': csrf },
        body: JSON.stringify({ revision: initial.revision, entries: [
            { ...common, id: 'legacy-category', kind: 'achievement-category', name: 'Migrated category', category: '' },
            { ...common, id: 'legacy-achievement', kind: 'achievements', name: 'Migrated achievement', category: 'legacy-category' },
            { ...common, id: 'legacy-story', kind: 'story', name: 'Legacy quest', category: 'Required' },
        ] }),
    });
    assert.equal(seeded.status, 200);
    await page.evaluate(() => localStorage.setItem('gg-player-v1', JSON.stringify({ version: 1,
        state: { 'genshin/legacy-achievement': { completed: true, quantity: 0, target: 0 }, 'genshin/legacy-story': { completed: true, quantity: 0, target: 0 } } })));
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.achievement-row');
    assert.equal(await page.$eval('.achievement-row input[type=checkbox]', (e) => e.checked), false);
    await page.click('[popovertarget=profile-menu]');
    await page.click('gg-account-menu button');
    await page.waitForSelector('gg-account-menu [role=dialog]');
    await page.click('gg-account-menu [role=dialog] button:last-child');
    await page.waitForFunction(() => !document.querySelector('gg-account-menu [role=dialog]'));
    await page.evaluate(() => document.querySelector('#profile-menu').hidePopover());
    assert.equal(await page.$eval('.achievement-row input[type=checkbox]', (e) => e.checked), true);
    const document = await collection.findOne({ name: 'Genshin Impact' });
    assert.deepEqual(document.events, [{ title: 'Parser-owned event' }]);
    assert.equal(document.version.title, 'Parser version');
    const savedAchievement = document.achievements[0].achievements[0];
    assert.ok(
        !('completed' in savedAchievement) &&
            !('quantity' in savedAchievement) &&
            !('target' in savedAchievement),
    );
    const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('gg-player-v1')));
    assert.equal(progress.state['genshin/legacy-achievement'].completed, true);
    assert.ok(!JSON.stringify(progress).includes('Migrated achievement'));
    let writes = 0;
    page.on('request', (request) => {
        if (request.method() === 'PUT') {
            writes++;
        }
    });
    await page.click('.achievement-row input[type=checkbox]');
    await page.waitForFunction(() =>
        document.querySelector('.category-count').innerText.includes('0 / 1'),
    );
    assert.equal(writes, 0, 'Completion must never write to shared catalog endpoints');
    await page.click('.achievement-row input[type=checkbox]');
    await page.waitForFunction(() =>
        document.querySelector('.category-count').innerText.includes('1 / 1'),
    );
    // A separate signed-in browser restores the account state without local progress storage.
    const secondSession = randomBytes(32).toString('base64url');
    const secondSessionId = createHash('sha256').update(secondSession).digest('hex');
    await client.db(process.env.DB_NAME).collection(collectionName + '_auth_sessions').insertOne({
        _id: secondSessionId, user: accountId, subject: 'smoke-editor', name: 'Smoke Editor', csrf,
        expiresAt: new Date(Date.now() + 3600000), idleAt: new Date(Date.now() + 3600000),
    });
    const signedInContext = await browser.createBrowserContext();
    try {
        await signedInContext.setCookie({ name: 'gg-local-session', value: secondSession, url: base, httpOnly: true, sameSite: 'Lax' });
        const signedInPage = await signedInContext.newPage();
        await signedInPage.goto(base + '/games/genshin/achievements', { waitUntil: 'networkidle0' });
        await signedInPage.waitForSelector('.achievement-row input');
        assert.equal(await signedInPage.$eval('.achievement-row input', (input) => input.checked), true);
        assert.equal(await signedInPage.evaluate(() => localStorage.getItem('gg-player-v1')), null);
        await signedInPage.click('[popovertarget=profile-menu]');
        await signedInPage.$$eval('gg-account-menu button', (buttons) => buttons.find((button) => button.textContent.trim() === 'Sign out').click());
        await signedInPage.waitForFunction(() => document.querySelector('.achievement-row input')?.checked === false);
        assert.equal(await client.db(process.env.DB_NAME).collection(collectionName + '_auth_sessions').countDocuments({ _id: secondSessionId }), 0);
    } finally { await signedInContext.close(); }
    const context = await browser.createBrowserContext();
    const other = await context.newPage();
    await other.goto(`${base}/games/genshin/achievements`, { waitUntil: 'networkidle0' });
    await other.waitForSelector('.achievement-row');
    assert.equal(
        await other.$eval('.achievement-row input[type=checkbox]', (e) => e.checked),
        false,
    );
    // Save a UI edit, then ensure another session sees the shared definition after reload.
    await page.click('.achievement-actions button');
    await page.waitForSelector('[role=dialog] input[name=name]');
    await page.$eval('[role=dialog] input[name=name]', (e) => {
        e.value = 'Shared title';
        e.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.click('[role=dialog] button[type=submit]');
    await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
    await other.reload({ waitUntil: 'networkidle0' });
    await other.waitForFunction(() =>
        document.querySelector('.achievement-details')?.textContent.includes('Shared title'),
    );
    assert.equal(await other.$eval('.achievement-row input', (e) => e.checked), false);
    // Optimistic concurrency and schema rejection against real MongoDB.
    const snapshot = await (await fetch(`${api}/api/games/genshin`)).json();
    const update = (body) =>
        fetch(`${api}/api/games/genshin/catalog`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Origin: base, Cookie: 'gg-local-session=' + rawSession, 'X-CSRF-Token': csrf },
            body: JSON.stringify(body),
        });
    assert.equal(
        (await update({ entries: snapshot.entries, revision: snapshot.revision })).status,
        200,
    );
    assert.equal(
        (await update({ entries: snapshot.entries, revision: snapshot.revision })).status,
        409,
    );
    assert.equal(
        (
            await update({
                entries: [{ ...snapshot.entries[0], completed: true }],
                revision: snapshot.revision + 1,
            })
        ).status,
        400,
    );
    assert.deepEqual((await (await fetch(`${api}/api/games/genshin/parsed`)).json()).events, [
        { title: 'Parser-owned event' },
    ]);
    const latest = await (await fetch(`${api}/api/games/genshin`)).json();
    const category = latest.entries.find((entry) => entry.kind === 'achievement-category');
    const achievement = latest.entries.find((entry) => entry.kind === 'achievements');
    const extraCategory = { ...category, id: 'second-category', name: 'Second category', order: 1 };
    const extraAchievement = {
        ...achievement,
        id: 'second-achievement',
        name: 'Second achievement',
        order: 1,
    };
    assert.equal(
        (
            await update({
                entries: [...latest.entries, extraCategory, extraAchievement],
                revision: latest.revision,
            })
        ).status,
        200,
    );
    await page.setViewport({ width: 1440, height: 1600 });
    await page.reload({ waitUntil: 'networkidle0' });
    const drag = async (handle, target) => {
        await page.$eval(handle, (element) => element.scrollIntoView({ block: 'center' }));
        const start = await (await page.$(handle)).boundingBox();
        const end = await (await page.$(target)).boundingBox();
        await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
        await page.mouse.down();
        await page.mouse.move(end.x + end.width / 2, end.y + 10, { steps: 12 });
        await page.mouse.up();
    };
    await drag(
        '[data-achievement-id="second-achievement"] .drag-handle',
        '[data-achievement-id="legacy-achievement"]',
    );
    await page.waitForFunction(
        () =>
            document.querySelector('[data-achievement-id]').getAttribute('data-achievement-id') ===
            'second-achievement',
    );
    await drag(
        '[data-category-id="second-category"] .category-heading .drag-handle',
        '[data-category-id="legacy-category"]',
    );
    await page.waitForFunction(
        () =>
            document.querySelector('[data-category-id]').getAttribute('data-category-id') ===
            'second-category',
    );
    await drag(
        '[data-achievement-id="legacy-achievement"] .drag-handle',
        '[data-category-id="second-category"] .category-heading',
    );
    await page.waitForSelector(
        '[data-category-id="second-category"] [data-achievement-id="legacy-achievement"]',
    );
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector(
        '[data-category-id="second-category"] [data-achievement-id="legacy-achievement"]',
    );
    assert.equal(
        await page.$eval('[data-category-id]', (element) =>
            element.getAttribute('data-category-id'),
        ),
        'second-category',
    );
    await checkStory(page, base, collection);
    await checkPatch(page, base, collection);
    assert.deepEqual(runtimeErrors, []);
    console.log(
        'Full-stack checks passed: automatic startup, MongoDB persistence, one document per game, parser preservation, legacy migration, account completion, explicit guest import, independent browser progress, shared edits, revision conflicts, and persisted drag ordering.',
    );
} catch (error) {
    console.error(log);
    throw error;
} finally {
    if (browser) {
        await browser.close();
    }
    // This random, test-owned collection is the only data removed by the test.
    if (/^middleware_test_[a-f0-9]{32}$/.test(collectionName)) {
        try {
            await client.db(process.env.DB_NAME).collection(collectionName).drop();
            await client
                .db(process.env.DB_NAME)
                .collection(`${collectionName}_schema_v1_backup`)
                .drop();
            for (const suffix of ['_auth_sessions', '_auth_logins', '_player_progress']) {
                await client.db(process.env.DB_NAME).collection(collectionName + suffix).drop().catch(() => {});
            }
        } catch {
            /* collection may not have been created */
        }
    }
    await client.close();
    if (stack.connected) {
        stack.send('shutdown');
    }
    if (stack.exitCode === null) {
        await Promise.race([
            new Promise((resolve) => stack.once('exit', resolve)),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Stack did not shut down cleanly.')), 15000),
            ),
        ]);
    }
}
