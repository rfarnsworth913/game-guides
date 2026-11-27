import { IMAGE_CATEGORIES } from '@lib/constants/image-category.constants';
import type { GameImage, ImageCategory } from '@lib/types/game-image.type';
import { inferImageCategory } from '@common/images/image-categories';

export type ImageSort = 'name-asc' | 'name-desc' | 'newest' | 'oldest' | 'recent';
export const imageCategories = Object.entries(IMAGE_CATEGORIES).map(([id, value]) => ({ id: id as ImageCategory, ...value }));

export function libraryImageCategory(image: GameImage, size?: { width?: number; height?: number }): ImageCategory {
    const category = image.details?.category;
    if (category && Object.hasOwn(IMAGE_CATEGORIES, category)) { return category; }
    const width = image.width ?? size?.width ?? image.details?.width;
    const height = image.height ?? size?.height ?? image.details?.height;
    return inferImageCategory(image.name, width, height);
}

export function libraryImageCategories(image: GameImage): ImageCategory[] {
    return [...new Set([libraryImageCategory(image), ...(image.details?.categories ?? []).filter(category => Object.hasOwn(IMAGE_CATEGORIES, category))])];
}

export function imageFormat(image: GameImage): string {
    const format = (image.format ?? image.name.split('.').at(-1) ?? '').toLowerCase();
    return format === 'webp' ? 'WebP' : format === 'jpg' || format === 'jpeg' ? 'JPEG' : format.toUpperCase();
}

export function fileSizeLabel(bytes?: number): string {
    return bytes === globalThis.undefined ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function imageAspect(width?: number, height?: number): string {
    if (!width || !height) { return 'Unknown'; }
    const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
    const divisor = gcd(width, height);
    return `${width / divisor}:${height / divisor}`;
}
