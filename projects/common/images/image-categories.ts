import { IMAGE_CATEGORIES } from '@lib/constants/image-category.constants';
import type { ImageCategory } from '@lib/types/game-image.type';

export type ImageUse = { filename: string; path: string; title: string; game: string };

export function imageUseCategory(path: string): ImageCategory | null {
    if (/\.characterDefinition\.headshot$/.test(path) || /^characters\[\d+\]\.icon$/.test(path)) { return 'headshot'; }
    if (/\.characterInformation\.imageUrl$/.test(path)) { return 'character'; }
    if (/icon$/i.test(path)) { return 'icon'; }
    if (/banner$|sectionImageUrl$|imageUrl$|versionImageUrl$/i.test(path)) { return 'banner'; }
    return null;
}

export function inferImageCategory(name: string, width?: number, height?: number): ImageCategory {
    if (/splash[-_ ]?art|full[-_ ]?art/i.test(name)) { return 'character'; }
    if (/headshot|character[-_ ]icon|portrait/i.test(name)) { return 'headshot'; }
    if (/(?:^|[-_ ])icon(?:[-_ .]|$)/i.test(name)) { return 'icon'; }
    if (/banner|divider/i.test(name)) { return 'banner'; }
    if (!width || !height) { return 'landscape'; }
    const ratio = width / height;
    return ratio >= 2.7 ? 'banner' : ratio < .9 ? 'character' : ratio < 1.2 ? 'icon' : 'landscape';
}

export function classifyImage(name: string, width: number | undefined, height: number | undefined, uses: ImageUse[], existing?: ImageCategory) {
    const inferred = inferImageCategory(name, width, height);
    const categories = new Set<ImageCategory>(uses.flatMap(use => imageUseCategory(use.path) ?? []));
    const explicitName = /splash[-_ ]?art|full[-_ ]?art|headshot|character[-_ ]icon|portrait|(?:^|[-_ ])icon(?:[-_ .]|$)|banner|divider/i.test(name);
    if (explicitName) { categories.add(inferred); }
    if (!categories.size) { categories.add(existing && Object.hasOwn(IMAGE_CATEGORIES, existing) ? existing : inferred); }
    if (existing && Object.hasOwn(IMAGE_CATEGORIES, existing)) { categories.add(existing); }
    const ordered = (Object.keys(IMAGE_CATEGORIES) as ImageCategory[]).filter(category => categories.has(category));
    const primary = existing && categories.has(existing) ? existing : explicitName || categories.has(inferred) ? inferred : ordered[0];
    return { category: primary, categories: ordered, reason: existing ? 'existing metadata and usage' : uses.length ? 'catalog usage and filename' : explicitName ? 'filename' : 'image dimensions' };
}
