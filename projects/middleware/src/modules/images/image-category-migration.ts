import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ImageDetails } from '@lib/types/game-image.type';
import { IMAGE_CATEGORIES } from '@lib/constants/image-category.constants';
import { classifyImage, type ImageUse } from '@common/images/image-categories';
import { friendlyImageName } from '@common/images/game-images';
import { ImageRepository } from './images.repository';
import { IMAGE_FILENAME } from './images.schema';

// Unreferenced assets reviewed visually; dimensions alone cannot identify their purpose.
const reviewedCategories = new Map<string, ImageDetails['category']>([
    ['honkai-star-rail/herta-8a262e8e-91dd-4156-ac59-dfe3de85c755.webp', 'headshot'],
    ['arknights-endfield/etchings-of-our-cosmic-dreams-8ca2a762-748b-4ba6-9302-cf5eb0dfe6f7.webp', 'banner'],
]);

export type ImageCategoryPlan = {
    folder: string;
    filename: string;
    previous: string | null;
    next: ImageDetails;
    reason: string;
    uses: ImageUse[];
    sha256: string;
    changed: boolean;
};
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** Read shared catalog references only; no catalog or player records are changed. */
export function collectImageUses(documents: Record<string, unknown>[]): ImageUse[] {
    const uses: ImageUse[] = [];
    const walk = (value: unknown, path: string, title: string, game: string): void => {
        if (typeof value === 'string') {
            const filename = value.split(/[?#]/)[0].split('/').at(-1) ?? '';
            if (IMAGE_FILENAME.test(filename)) { uses.push({ filename, path, title, game }); }
        } else if (Array.isArray(value)) { value.forEach((item, index) => walk(item, `${path}[${index}]`, title, game)); }
        else if (value && typeof value === 'object') {
            const item = value as Record<string, unknown>;
            const label = typeof item['name'] === 'string' ? item['name'] : typeof item['title'] === 'string' ? item['title'] : title;
            for (const [key, child] of Object.entries(item)) { walk(child, path ? `${path}.${key}` : key, label, game); }
        }
    };
    for (const document of documents) {
        const overview = document['_gameOverview'] as { name?: string } | undefined;
        walk(document, '', '', overview?.name ?? (typeof document['name'] === 'string' ? document['name'] : ''));
    }
    return uses;
}

export async function planImageCategories(root: string, uses: ImageUse[]): Promise<ImageCategoryPlan[]> {
    const plan: ImageCategoryPlan[] = [];
    for (const directory of (await readdir(root, { withFileTypes: true })).filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
        const repository = new ImageRepository(join(root, directory.name));
        for (const filename of (await repository.names()).sort()) {
            const path = join(root, directory.name, filename);
            const previous = await readFile(`${path}.json`, 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') { return null; } throw error; });
            const existing = previous ? JSON.parse(previous) as ImageDetails : {};
            const info = await repository.info(filename);
            const references = uses.filter(use => use.filename === filename);
            const classification = classifyImage(filename, info.width, info.height, references, existing.category ?? reviewedCategories.get(`${directory.name}/${filename}`));
            const categories = [...new Set([...classification.categories, ...(existing.categories ?? [])])].filter(category => Object.hasOwn(IMAGE_CATEGORIES, category)).sort();
            const next = { ...existing, title: existing.title || friendlyImageName(filename), category: classification.category, categories,
                ...(info.width && info.height ? { width: existing.width ?? info.width, height: existing.height ?? info.height } : {}),
                tags: existing.tags ?? '' };
            // Existing tags are a single preserved string; avoid joining them again on subsequent runs.
            const addedTags = [...new Set(references.flatMap(use => [use.game, use.title]).filter(tag => tag && !(existing.tags ?? '').includes(tag)))].sort((a, b) => a.localeCompare(b));
            next.tags = [existing.tags ?? '', ...addedTags].filter(Boolean).join(', ');
            plan.push({ folder: directory.name, filename, previous, next, reason: classification.reason, uses: references,
                sha256: hash(await readFile(path)), changed: JSON.stringify(existing) !== JSON.stringify(next) });
        }
    }
    return plan;
}

export async function applyImageCategories(root: string, plan: ImageCategoryPlan[], backup: string): Promise<number> {
    await mkdir(backup, { recursive: true });
    await writeFile(join(backup, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), images: plan.map(item => ({
        path: `${item.folder}/${item.filename}`, sha256: item.sha256, previousMetadata: item.previous, nextMetadata: item.next,
    })) }, null, 2), { flag: 'wx' });
    // Preflight the complete plan before the first metadata write.
    for (const item of plan) {
        const path = join(root, item.folder, item.filename);
        if (hash(await readFile(path)) !== item.sha256) { throw new Error(`Image changed since classification: ${item.filename}`); }
        const current = await readFile(`${path}.json`, 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') { return null; } throw error; });
        if (current !== item.previous) { throw new Error(`Image metadata changed since classification: ${item.filename}`); }
    }
    let count = 0;
    for (const item of plan.filter(item => item.changed)) {
        const path = join(root, item.folder, item.filename);
        await mkdir(dirname(path), { recursive: true });
        await new ImageRepository(join(root, item.folder)).writeDetails(item.filename, item.next);
        count++;
    }
    for (const item of plan) {
        if (hash(await readFile(join(root, item.folder, item.filename))) !== item.sha256) { throw new Error(`Original image verification failed: ${item.filename}`); }
    }
    return count;
}
