import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: true });
try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1600 });
    const url = 'http://127.0.0.1:4200/games/genshin/achievements';
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
        const make = (id, kind, category = '', order = 0) => ({
            id,
            kind,
            category,
            order,
            game: 'genshin',
            name: id,
            notes: '',
            quantity: 0,
            target: 0,
            rarity: 0,
            members: [],
            requirements: [],
            completed: false,
            day: 'Any day',
        });
        localStorage.setItem(
            'gg-workspace-v1',
            JSON.stringify({
                version: 1,
                entries: [
                    make('cat1', 'achievement-category'),
                    make('cat2', 'achievement-category', '', 1),
                    make('first', 'achievements', 'cat1'),
                    make('second', 'achievements', 'cat1', 1),
                ],
            }),
        );
    });
    await page.reload({ waitUntil: 'networkidle0' });
    const drag = async (handle, target, after = false) => {
        await page.locator(handle).scroll();
        const h = await page.$(handle);
        const a = await h.boundingBox();
        const t = await page.$(target);
        const b = await t.boundingBox();
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.move(b.x + b.width / 2, b.y + (after ? b.height - 10 : 10), { steps: 15 });
        await page.mouse.up();
    };
    await drag('[data-achievement-id="second"] .drag-handle', '[data-achievement-id="first"]');
    await page.waitForFunction(
        () =>
            document.querySelector('[data-achievement-id]').getAttribute('data-achievement-id') ===
            'second',
    );
    await drag(
        '[data-category-id="cat2"] .category-heading .drag-handle',
        '[data-category-id="cat1"]',
    );
    await page.waitForFunction(
        () =>
            document.querySelector('[data-category-id]').getAttribute('data-category-id') ===
            'cat2',
    );
    await drag(
        '[data-achievement-id="first"] .drag-handle',
        '[data-category-id="cat2"] .category-heading',
    );
    await page.waitForFunction(() =>
        document.querySelector('[data-category-id="cat2"] [data-achievement-id="first"]'),
    );
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(
        await page.$eval('[data-category-id]', (e) => e.getAttribute('data-category-id')),
        'cat2',
    );
    assert.ok(await page.$('[data-category-id="cat2"] [data-achievement-id="first"]'));
    await page.focus('[data-category-id="cat2"] .category-heading .drag-handle');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(
        () =>
            document.querySelector('[data-category-id]').getAttribute('data-category-id') ===
            'cat1',
    );
    assert.equal(
        await page.$eval('.achievement-row', (e) => getComputedStyle(e).textAlign),
        'center',
    );
    assert.ok(
        await page.$eval('.category-heading', (e) =>
            e.lastElementChild.classList.contains('category-toggle'),
        ),
    );
    await page.setViewport({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    console.log(
        'Ordering checks passed: actual pointer dragging of rows/categories, cross-category moves, reload persistence, keyboard ordering, right-side toggle, centered rows, mobile width.',
    );
} finally {
    await browser.close();
}
