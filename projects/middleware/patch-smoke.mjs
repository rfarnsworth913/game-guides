import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export async function checkPatch(page, base, collection) {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const imageUrl = 'https://patch-image.example/banner.svg';
    await page.setRequestInterception(true);
    const intercept = (request) =>
        request.url() === imageUrl
            ? request.respond({
                  status: 200,
                  contentType: 'image/svg+xml',
                  body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#082f49"/><text x="80" y="215" font-size="60" fill="#e0f2fe">Version 6.0 — Patch Overview</text></svg>',
              })
            : request.continue();
    page.on('request', intercept);
    try {
        await page.goto(`${base}/games/genshin/story`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('gg-story [role=switch]:not(:disabled)');
        await page.click('gg-story [role=switch]');
        await page.waitForSelector('gg-story [role=switch][aria-checked=true]');
        const click = async (label) =>
            page.$$eval(
                'gg-story button',
                (buttons, text) => {
                    const button = buttons.find(
                        (item) => item.textContent.trim() === text && item.offsetParent !== null,
                    );
                    assertButton(button);
                    function assertButton(button) {
                        if (!button) throw new Error(`Missing button: ${text}`);
                        button.click();
                    }
                },
                label,
            );
        const fill = async (selector, value) => {
            await page.waitForSelector(selector);
            return page.$eval(
                selector,
                (element, value) => {
                    element.value = value;
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                },
                value,
            );
        };
        const save = async () => {
            await click('Save changes');
            await page.waitForSelector('gg-story [role=dialog]', { hidden: true });
        };
        await click('+ Add subsection');
        await fill('[name=title]', 'Version 6.0 overview');
        await page.select('[name=topic]', 'patch-overview');
        await click('Create Subsection');
        await page.waitForSelector('gg-story [role=dialog]', { hidden: true });
        await click('Edit');
        await page.$$eval('gg-game-image-picker details', (items) => items.forEach((item) => item.open = true));
        await fill('gg-game-image-picker .image-advanced input', imageUrl);
        await fill('gg-game-image-picker .image-details > label:nth-of-type(2) input', 'Version 6.0 patch banner');
        await fill('gg-game-image-picker .image-details > label:nth-of-type(3) input', 'Official website');
        await fill('gg-game-image-picker .image-details > label:nth-of-type(4) input', 'https://example.com/patch');
        await fill('[name=patchVersion]', '6.0');
        await fill('[name=patchTitle]', 'A New Horizon');
        await fill('[name=releaseDate]', '2026-10-09');
        await click('+ Add group');
        await fill('.patch-group-edit-row [name^="groupTitle-"]', 'Trailers');
        await click('+ Add group');
        await page.waitForFunction(
            () => document.querySelectorAll('.patch-group-edit-row').length === 2,
        );
        await fill('.patch-edit-group:nth-of-type(2) .patch-group-edit-row [name^="groupTitle-"]', 'EPs');
        await click('+ Add Row');
        await fill('.patch-row-editor [name^="content-"]', 'Chapter One');
        await fill('.patch-row-editor [name^="link-"]', 'https://example.com/trailer');
        await fill('.patch-row-editor [name^="patch-"]', '6.0');
        await fill('.patch-row-editor [name^="notes-"]', 'These notes span both columns.');
        await page.$$eval('.patch-edit-group', (groups) => groups[1].querySelector('.patch-row-add button').click());
        await page.waitForFunction(
            () => document.querySelectorAll('.patch-row-editor').length === 2,
        );
        const second = '.patch-edit-group:nth-of-type(2) .patch-row-editor';
        await fill(`${second} [name^="content-"]`, 'Festival');
        await fill(`${second} [name^="patch-"]`, '6.0');
        await page.$$eval(`${second} .row-flags input`, (inputs) => inputs[1].click());
        await fill(`${second} [name^="notes-"]`, 'Starts October 9');
        await fill(`${second} [name^="notesRight-"]`, 'Limited-time rewards');
        await save();
        await page.waitForSelector('.patch-table tbody input');
        await page.waitForFunction(
            () => document.querySelector('.patch-banner')?.naturalWidth === 1200,
        );
        assert.deepEqual(
            await page.$eval('.patch-table', (table) =>
                [...table.querySelectorAll('th')].map((cell) => cell.textContent),
            ),
            ['Completed', 'Content', 'Patch', 'Notes'],
        );
        assert.deepEqual(
            await page.$$eval('.patch-table thead tr', (rows) =>
                rows.map((row) => [...row.cells].reduce((sum, cell) => sum + cell.colSpan, 0)),
            ),
            [5, 5],
        );
        assert.deepEqual(
            await page.$$eval('.patch-table tbody tr', (rows) =>
                rows.map((row) => [...row.cells].map((cell) => cell.colSpan)),
            ),
            [
                [1, 1, 1, 2],
                [1, 1, 1, 1, 1],
            ],
        );
        assert.equal(
            await page.$eval('.patch-source a', (link) => link.href),
            'https://example.com/patch',
        );
        assert.equal(
            await page.$eval('.patch-source', (cell) => getComputedStyle(cell).textAlign),
            'right',
        );
        assert.equal(
            await page.$eval('.patch-content-cell a', (link) => link.href),
            'https://example.com/trailer',
        );
        assert.equal(
            await page.$eval('.patch-version-cell', (cell) => getComputedStyle(cell).textAlign),
            'center',
        );
        assert.deepEqual(
            await page.$$eval('.patch-group-heading h4', (headings) =>
                headings.map((heading) => heading.textContent),
            ),
            ['Trailers', 'EPs'],
        );
        await page.click('gg-story [role=switch]');
        await page.waitForSelector('gg-story [role=switch][aria-checked=false]');
        assert.equal(await page.$$eval('.story-outline a', (links) => links.length), 1);
        await page.click('.story-outline a');
        await page.waitForFunction(() =>
            document.activeElement?.classList.contains('story-section'),
        );
        assert.ok(
            await page.$eval('.patch-banner-release', (element) =>
                element.textContent.includes('Oct 9, 2026'),
            ),
        );
        const before = await collection.findOne({ name: 'Genshin Impact' });
        await page.click('.patch-table tbody input');
        await page.waitForFunction(
            () => document.querySelector('.patch-table tbody input').checked,
        );
        await page.reload({ waitUntil: 'networkidle0' });
        await page.waitForSelector('.patch-table tbody input');
        assert.equal(await page.$eval('.patch-table tbody input', (input) => input.checked), true);
        assert.equal(
            (await collection.findOne({ name: 'Genshin Impact' }))._revision,
            before._revision,
        );
        const definition = before.story[0].category.content.subsections[0];
        assert.equal(definition.patchOverview.rows[1].notesRight, 'Limited-time rewards');
        assert.ok(!('storyRowCompletion' in definition));
        const context = await page.browser().createBrowserContext();
        try {
            const other = await context.newPage();
            await other.goto(`${base}/games/genshin/story`, { waitUntil: 'networkidle0' });
            await other.waitForSelector('.patch-table tbody input');
            assert.equal(
                await other.$eval('.patch-table tbody input', (input) => input.checked),
                false,
            );
            assert.equal(
                await other.$eval('.patch-content-cell', (cell) =>
                    cell.textContent.trim().startsWith('Chapter One'),
                ),
                true,
            );
        } finally {
            await context.close();
        }
        await page.click('gg-story [role=switch]');
        await page.waitForSelector('gg-story [role=switch][aria-checked=true]');
        await click('Edit');
        await page.click('.group-overflow summary');
        await page.click('button[aria-label="Move group 1 down"]');
        await save();
        assert.deepEqual(
            await page.$$eval('.patch-table tbody input', (inputs) =>
                inputs.map((input) => input.checked),
            ),
            [false, true],
        );
        await page.click('gg-story [role=switch]');
        await page.waitForSelector('gg-story [role=switch][aria-checked=false]');
        await page.setViewport({ width: 1536, height: 1024 });
        await page.screenshot({
            path: join(tmpdir(), 'game-guides-patch-overview.png'),
            fullPage: true,
        });
        await page.setViewport({ width: 390, height: 844 });
        assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            true,
        );
        await page.setViewport({ width: 1280, height: 900 });
    } finally {
        page.off('request', intercept);
        await page.setRequestInterception(false);
    }
}
