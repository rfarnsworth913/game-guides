import type { IMAGE_CATEGORIES } from '../constants/image-category.constants';

export type ImageCategory = keyof typeof IMAGE_CATEGORIES;
export type ImageDetails = {
    title?: string;
    category?: ImageCategory;
    categories?: ImageCategory[];
    tags?: string;
    description?: string;
    sourceName?: string;
    sourceUrl?: string;
    width?: number;
    height?: number;
};
export type GameImage = {
    name: string;
    url: string;
    details?: ImageDetails;
    thumbnailUrl?: string;
    width?: number;
    height?: number;
    format?: string;
    fileSize?: number;
    createdAt?: string;
    updatedAt?: string;
};
