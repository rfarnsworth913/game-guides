export type ImageCategory = 'banner' | 'character' | 'landscape' | 'icon';
export type ImageDetails = {
    title?: string;
    category?: ImageCategory;
    tags?: string;
    description?: string;
    sourceName?: string;
    sourceUrl?: string;
    width?: number;
    height?: number;
};
export type GameImage = { name: string; url: string; details?: ImageDetails };
