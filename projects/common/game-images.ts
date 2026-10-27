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

export function friendlyImageName(name: string): string {
    return name.replace(/\.[^.]+$/, '').replace(/-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i, '')
        .replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
