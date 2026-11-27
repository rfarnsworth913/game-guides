import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { classifyImage } from '@common/images/image-categories';
import { applyImageCategories, collectImageUses, planImageCategories } from './image-category-migration';

await test('catalog usage classifies square splash artwork and shared portraits independently of aspect ratio', () => {
    const uses = collectImageUses([{ name: 'Example', characters: [{ name: 'Hero', icon: '/images/hero.webp', characterInformation: { imageUrl: '/images/hero.webp' } }] }]);
    const result = classifyImage('hero.webp', 512, 512, uses);
    assert.deepEqual(new Set(result.categories), new Set(['character', 'headshot']));
    assert.ok(!result.categories.includes('icon'));
    assert.equal(classifyImage('hero-splash-art.webp', 1920, 1920, []).category, 'character');
    assert.equal(classifyImage('hero-character-icon.webp', 900, 352, []).category, 'headshot');
});

await test('image tagging backs up metadata, preserves originals and attribution, and is idempotent', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'image-category-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const root = join(directory, 'assets');
    const folder = join(root, 'example');
    await mkdir(folder, { recursive: true });
    const image = await sharp({ create: { width: 120, height: 40, channels: 4, background: 'red' } }).webp().toBuffer();
    await writeFile(join(folder, 'banner.webp'), image);
    const previous = JSON.stringify({ title: 'Original title', description: 'Keep me', sourceName: 'Artist', sourceUrl: 'https://example.com', tags: 'custom' });
    await writeFile(join(folder, 'banner.webp.json'), previous);
    const uses = [{ filename: 'banner.webp', path: '_gameOverview.banner', game: 'Example', title: 'Hero' }];
    const plan = await planImageCategories(root, uses);
    assert.equal(plan[0].changed, true);
    assert.equal(await readFile(join(folder, 'banner.webp.json'), 'utf8'), previous);
    const backup = join(directory, 'backup');
    assert.equal(await applyImageCategories(root, plan, backup), 1);
    const manifest = JSON.parse(await readFile(join(backup, 'manifest.json'), 'utf8')) as { images: { previousMetadata: string }[] };
    assert.equal(manifest.images[0].previousMetadata, previous);
    const after = await planImageCategories(root, uses);
    assert.equal(after[0].changed, false);
    assert.equal(after[0].next.title, 'Original title');
    assert.equal(after[0].next.sourceName, 'Artist');
    assert.equal(after[0].next.tags, 'custom, Example, Hero');
    assert.deepEqual(await readFile(join(folder, 'banner.webp')), image);
    await writeFile(join(folder, 'banner.webp.json'), '{}');
    await assert.rejects(applyImageCategories(root, after, join(directory, 'second-backup')), /metadata changed/);
});
