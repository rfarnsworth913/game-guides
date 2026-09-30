import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer';
await mkdir('.angular/workspace-smoke', { recursive: true });
const browser = await puppeteer.launch({ headless: true });
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const base = process.env.GUIDES_URL || 'http://127.0.0.1:4200';
    const visit = async (route) => {
        await page.goto(
            base +
                (['/inventory', '/characters', '/teams', '/plans', '/story', '/farming'].includes(
                    route,
                )
                    ? '/games/genshin' + route
                    : route),
            { waitUntil: 'networkidle0' },
        );
        await page.waitForSelector('gg-workspace');
    };
    const clickText = async (text) => {
        const found = await page.evaluate((t) => {
            const el = [...document.querySelectorAll('button,a')].find(
                (e) => e.textContent.trim() === t,
            );
            el?.click();
            return !!el;
        }, text);
        assert.ok(found, `Control not found: ${text}`);
    };
    const fill = async (name, value) => {
        const selector = `[name="${name}"]`;
        await page.waitForSelector(selector);
        await page.$eval(
            selector,
            (e, v) => {
                e.value = v;
                e.dispatchEvent(new Event('input', { bubbles: true }));
            },
            value,
        );
    };
    const save = async () => {
        await clickText('Save changes');
        await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    };
    const add = async (route, name, quantity) => {
        await visit(route);
        await page.evaluate(() => document.querySelector('.heading-action button').click());
        await fill('name', name);
        if (quantity !== undefined) await fill('quantity', quantity);
        await save();
    };
    await page.setViewport({ width: 1440, height: 1100 });
    await visit('/dashboard');
    assert.equal(await page.$('nav a[href$="/inventory"]'), null);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle0' });
    await page.screenshot({ path: '.angular/workspace-smoke/desktop.png', fullPage: true });
    await page.goto(base + '/inventory', { waitUntil: 'networkidle0' });
    assert.equal(new URL(page.url()).pathname, '/games');
    await page.click('a.game-card[href="/games/genshin/dashboard"]');
    await page.waitForFunction(() => location.pathname === '/games/genshin/dashboard');
    await add('/inventory', 'Test crystal', '10');
    assert.equal(
        await page.$eval('nav a[href$="/inventory"]', (e) => e.getAttribute('href')),
        '/games/genshin/inventory',
    );
    await add('/characters', 'Test character', '20');
    await visit('/plans');
    await page.evaluate(() => document.querySelector('.heading-action button').click());
    await fill('name', 'Test build');
    const itemId = await page.$eval('select[name="item"]', (e) => e.options[1].value);
    await page.select('select[name="item"]', itemId);
    await fill('amount', '25');
    await clickText('Add');
    await page.click('fieldset input[type="checkbox"]');
    await save();
    await visit('/farming');
    assert.match(await page.$eval('tbody', (e) => e.innerText), /Test crystal/);
    assert.match(await page.$eval('tbody', (e) => e.innerText), /15/);
    await add('/teams', 'Test team');
    await add('/story', 'Test chapter');
    await clickText('Complete');
    await page.reload({ waitUntil: 'networkidle0' });
    assert.match(await page.$eval('main', (e) => e.innerText), /Reopen/);
    await page.select('#game-context', 'zzz');
    await page.waitForFunction(() =>
        document.querySelector('main').innerText.includes('A fresh start'),
    );
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(await page.$eval('#game-context', (e) => e.value), 'zzz');
    await page.select('#game-context', 'genshin');
    await visit('/inventory');
    await clickText('Edit');
    await fill('quantity', '30');
    await save();
    await visit('/farming');
    assert.match(await page.$eval('tbody', (e) => e.innerText), /Ready/);
    await visit('/inventory');
    await clickText('Delete');
    await clickText('Delete entry');
    await page.waitForFunction(() => !document.querySelector('[role="alertdialog"]'));
    await page.reload({ waitUntil: 'networkidle0' });
    assert.match(await page.$eval('main', (e) => e.innerText), /A fresh start/);
    await visit('/settings');
    const backup = { version: 1, entries: [] };
    await page.evaluate((data) => {
        const input = document.querySelector('input[type=file]');
        const transfer = new DataTransfer();
        transfer.items.add(
            new File([JSON.stringify(data)], 'backup.json', { type: 'application/json' }),
        );
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }, backup);
    await page.waitForFunction(() =>
        document.querySelector('main').innerText.includes('Backup imported'),
    );
    await page.setViewport({ width: 390, height: 844 });
    await visit('/dashboard');
    assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        'Mobile layout overflows',
    );
    await page.click('.menu');
    await page.waitForFunction(
        () => getComputedStyle(document.querySelector('aside')).display !== 'none',
    );
    await page.click('.menu');
    await page.screenshot({ path: '.angular/workspace-smoke/mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log(
        'Browser checks passed: create/edit/delete, plan shortages, completion, persistence, game isolation, backup import, mobile navigation, and no runtime errors.',
    );
} finally {
    await browser.close();
}
