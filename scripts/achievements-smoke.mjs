import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: true });
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const url = 'http://127.0.0.1:4200/games/genshin/achievements';
    await page.goto(url, { waitUntil: 'networkidle0' });
    const click = async (text) => {
        await page.evaluate(
            (t) =>
                [...document.querySelectorAll('button')]
                    .find((e) => e.textContent.trim() === t)
                    ?.click(),
            text,
        );
    };
    const fill = async (name, value) => {
        await page.waitForSelector(`[role="dialog"] [name="${name}"]`);
        await page.$eval(
            `[role="dialog"] [name="${name}"]`,
            (e, v) => {
                e.value = v;
                e.dispatchEvent(new Event('input', { bubbles: true }));
            },
            value,
        );
    };
    const save = async () => {
        await click('Save changes');
        await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
    };
    await click('+ Add category');
    await fill('name', 'World Explorer');
    await fill('icon', 'http://127.0.0.1:4200/favicon.ico');
    await fill('wikiUrl', 'https://example.com/wiki');
    await fill('reward', 'Explorer namecard');
    await fill('rewardIcon', 'http://127.0.0.1:4200/favicon.ico');
    await save();
    await click('+ Add achievement');
    await fill('name', 'First steps');
    await fill('description', 'Begin your journey across the world.');
    await fill('rewardIcon', 'G');
    await fill('wikiUrl', 'https://example.com/achievement');
    await fill('requirementText', 'Discover three waypoints.');
    await fill('reward', '10 gems');
    await save();
    assert.match(await page.$eval('.category-count', (e) => e.innerText), /0 \/ 1/);
    await page.click('.achievement-row input[type=checkbox]');
    await page.waitForFunction(() =>
        document.querySelector('.category-count').innerText.includes('1 / 1'),
    );
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(await page.$eval('.achievement-row input', (e) => e.checked), true);
    assert.match(
        await page.$eval('gg-achievements', (e) => e.innerText),
        /Discover three waypoints/,
    );
    assert.match(await page.$eval('gg-achievements', (e) => e.innerText), /10 gems/);
    assert.match(await page.$eval('.category-reward', (e) => e.innerText), /Explorer namecard/);
    assert.equal(await page.$eval('.category-title a', (e) => e.href), 'https://example.com/wiki');
    assert.equal(
        await page.$eval('.achievement-details h3 a', (e) => e.href),
        'https://example.com/achievement',
    );
    assert.ok(await page.$eval('.category-icon img', (e) => e.complete && e.naturalWidth > 0));
    assert.ok(
        await page.$eval('.achievement-requirements', (e) =>
            e.parentElement.classList.contains('achievement-row'),
        ),
    );
    assert.match(
        await page.$eval('.achievement-description', (e) => e.innerText),
        /Begin your journey/,
    );
    assert.equal(
        await page.$eval('.achievement-rewards .reward-icon', (e) => e.innerText.trim()),
        'G',
    );
    assert.ok(
        await page.$eval(
            '.category-reward .reward-icon img',
            (e) => e.complete && e.naturalWidth > 0,
        ),
    );
    await page.click('.category-toggle');
    await page.waitForFunction(() => document.querySelector('.achievement-list').hidden);
    await page.type('#achievement-search', 'journey');
    await page.waitForFunction(() => !document.querySelector('.achievement-list').hidden);
    assert.equal(await page.$$('.achievement-row').then((rows) => rows.length), 1);
    await page.type('#achievement-search', 'zzzz');
    await page.waitForFunction(() =>
        document.querySelector('gg-achievements').innerText.includes('No matching achievements'),
    );
    await click('Clear search');
    await page.waitForSelector('.achievement-row');
    await page.click('.category-toggle');
    await page.waitForFunction(() => document.querySelector('.achievement-list').hidden);
    await page.click('.category-toggle');
    await page.waitForFunction(() => !document.querySelector('.achievement-list').hidden);
    await page.select('#game-context', 'zzz');
    await page.waitForFunction(() => location.pathname.includes('/zzz/'));
    await page.waitForFunction(() =>
        document
            .querySelector('gg-achievements')
            .innerText.includes('Every achievement has a place'),
    );
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.setViewport({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await click('Delete category');
    await click('Cancel');
    assert.equal(await page.$$('.achievement-row').then((a) => a.length), 1);
    await click('Delete category');
    await page.click('[role=alertdialog] .danger');
    await page.waitForFunction(() => !document.querySelector('.achievement-category'));
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(await page.$$('.achievement-row').then((a) => a.length), 0);
    assert.deepEqual(errors, []);
    console.log(
        'Achievement checks passed: category and achievement creation, requirements/rewards, counts, completion persistence, wiki link, game isolation, mobile layout, deletion confirmation and persistence.',
    );
} finally {
    await browser.close();
}
