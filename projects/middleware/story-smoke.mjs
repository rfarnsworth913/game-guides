import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export async function checkStory(page, base, collection) {
    await page.goto(`${base}/games/genshin/story`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('gg-story [role=tab]');
    assert.equal(
        await page.$eval('gg-story [role=switch]', (button) => button.getAttribute('aria-checked')),
        'false',
    );
    assert.equal(await page.$$eval('gg-story .story-actions', (controls) => controls.length), 0);
    const click = async (label) =>
        page.$$eval(
            'gg-story button',
            (buttons, text) => {
                const button = buttons.find(
                    (element) =>
                        element.textContent.trim() === text && element.offsetParent !== null,
                );
                if (!button) throw new Error(`Button not found: ${text}`);
                button.click();
            },
            label,
        );
    const fill = async (name, value) =>
        page.$eval(
            `gg-story [name="${name}"]`,
            (element, text) => {
                element.value = text;
                element.dispatchEvent(new Event('input', { bubbles: true }));
            },
            value,
        );
    const save = async () => {
        await click('Save changes');
        await page.waitForSelector('gg-story [role=dialog]', { hidden: true });
    };
    const title = async (expected) =>
        page.waitForFunction(
            (text) => document.querySelector('gg-story .story-heading h2')?.textContent === text,
            {},
            expected,
        );

    await title('General');
    assert.equal(await page.$eval('gg-story .story-section input', (input) => input.checked), true);
    const before = await collection.findOne({ name: 'Genshin Impact' });
    await page.click('gg-story .story-section input');
    await page.waitForFunction(
        () => !document.querySelector('gg-story .story-section input').checked,
    );
    assert.equal(
        (await collection.findOne({ name: 'Genshin Impact' }))._revision,
        before._revision,
    );

    await page.click('gg-story [role=switch]');
    await page.waitForSelector('gg-story [role=switch][aria-checked=true]');
    await page.click('gg-story [role=switch]');
    await page.waitForSelector('gg-story [role=switch][aria-checked=false]');
    assert.equal(
        (await collection.findOne({ name: 'Genshin Impact' }))._revision,
        before._revision,
    );
    assert.equal(await page.$$eval('gg-story .story-actions', (controls) => controls.length), 0);
    await page.click('gg-story [role=switch]');
    await page.waitForSelector('gg-story [role=switch][aria-checked=true]');
    await click('+ Add section');
    await fill('title', 'Mondstadt');
    await fill('icon', '✦');
    await save();
    await title('Mondstadt');
    await click('+ Add subsection');
    await fill('title', 'Prologue');
    await page.select('gg-story select[name=topic]', 'main-story');
    await click('Create Subsection');
    await page.waitForSelector('gg-story [role=dialog]', { hidden: true });
    await click('Edit');
    await click('+ Add Row');
    await page.$eval('gg-story [name^="content-"]', (input) => {
        input.value = 'Follow the wind to the city gates.';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await save();
    await page.waitForSelector('gg-story [data-story-topic="main-story"]');
    await click('Edit section');
    await fill('title', 'Mondstadt / 1.0');
    await save();
    await title('Mondstadt / 1.0');
    await page.click('gg-story button[aria-label="Move section left"]');
    await page.waitForFunction(() =>
        document.querySelector('gg-story [role=tab]')?.textContent.includes('Mondstadt'),
    );
    await page.reload({ waitUntil: 'networkidle0' });
    await title('Mondstadt / 1.0');
    const saved = await collection.findOne({ name: 'Genshin Impact' });
    const section = saved.story.find(
        (record) => record.category.title === 'Mondstadt / 1.0',
    ).category;
    assert.equal(section.order, 0);
    assert.equal(section.content.subsections[0].name, 'Prologue');
    assert.ok(!('completed' in section.content.subsections[0]));
    // A fresh player sees the same shared definitions, but has independent completion.
    const playerContext = await page.browser().createBrowserContext();
    try {
        const otherPlayer = await playerContext.newPage();
        await otherPlayer.goto(`${base}/games/genshin/story`, { waitUntil: 'networkidle0' });
        await otherPlayer.waitForSelector('gg-story .story-section input');
        assert.equal(
            await otherPlayer.$eval('gg-story .story-heading h2', (element) => element.textContent),
            'Mondstadt / 1.0',
        );
        assert.equal(
            await otherPlayer.$eval('gg-story .patch-content-cell', (element) =>
                element.textContent.trim(),
            ),
            'Follow the wind to the city gates.',
        );
        assert.equal(
            await otherPlayer.$eval('gg-story .story-section input', (element) => element.checked),
            false,
        );
        await page.click('gg-story .story-section input');
        await page.waitForFunction(
            () => document.querySelector('gg-story .story-section input').checked,
        );
        await otherPlayer.reload({ waitUntil: 'networkidle0' });
        await otherPlayer.waitForSelector('gg-story .story-section input');
        assert.equal(
            await otherPlayer.$eval('gg-story .story-section input', (element) => element.checked),
            false,
        );
        await page.reload({ waitUntil: 'networkidle0' });
        await page.waitForSelector('gg-story .story-section input');
        assert.equal(
            await page.$eval('gg-story .story-section input', (element) => element.checked),
            true,
        );
        assert.equal(
            (await collection.findOne({ name: 'Genshin Impact' }))._revision,
            saved._revision,
        );
    } finally {
        await playerContext.close();
    }
    const screenshot = join(tmpdir(), 'game-guides-story-smoke.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log(`Story preview: ${screenshot}`);
    await page.setViewport({ width: 390, height: 844 });
    assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
    );
    await page.setViewport({ width: 1280, height: 900 });
    // Keyboard navigation selects the neighboring section and updates focus.
    await page.focus('gg-story [role=tab][aria-selected=true]');
    await page.keyboard.press('ArrowRight');
    await title('General');
    await page.keyboard.press('ArrowLeft');
    await title('Mondstadt / 1.0');
    // Move a subsection using its editor, then delete a populated section explicitly.
    await page.click('gg-story [role=switch]');
    await page.waitForSelector('gg-story [role=switch][aria-checked=true]');
    await click('Edit');
    await page.select('gg-story select[name=section]', 'story-category:genshin:general');
    await page.select('gg-story select[name=topic]', 'world-quests');
    await save();
    await title('General');
    await page.waitForSelector('gg-story [data-story-topic="world-quests"]');
    await click('Delete section');
    await page.waitForSelector('gg-story [role=alertdialog]');
    await page.click('gg-story [role=alertdialog] .danger');
    await page.waitForSelector('gg-story [role=alertdialog]', { hidden: true });
    await title('Mondstadt / 1.0');
    const after = await collection.findOne({ name: 'Genshin Impact' });
    assert.equal(after.story.length, 1);
    assert.deepEqual(after.story[0].category.content.subsections, []);
    assert.ok(after.achievements.length > 0, 'Story deletion must preserve other game data');
    await page.goto(`${base}/games/hsr/story`, { waitUntil: 'networkidle0' });
    assert.equal(
        await page.$$eval('gg-story [role=tab]', (tabs) =>
            tabs.some((tab) => tab.textContent.includes('Mondstadt')),
        ),
        false,
    );
}
