import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { GAMES } from '@lib/constants/workspace.constants';
import type { ImageCategory, ImageDetails } from '@lib/types/game-image.type';
import { httpUrl } from '@common/quests/story-template';
import { ApiError } from '../../core/errors/app-error';
import { ImageRepository } from './images.repository';
import { IMAGE_FILENAME, imageType } from './images.schema';
import { validGameId } from '@common/workspace/game-overview';
import { IMAGE_CATEGORIES } from '@lib/constants/image-category.constants';
export function gameImageFolder(id: string): string {
    const game = GAMES.find((game) => game.id === id);
    if (!game && !validGameId(id))
        {throw new ApiError(404, 'Unknown game.');}
    if (!game) {return `game-${id}`;}
    return game.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
export class ImagesService {
    private readonly repository: ImageRepository;
    constructor(root: string, private readonly game: string) {
        this.repository = new ImageRepository(join(root, gameImageFolder(game)));
    }
    private item(name: string) { return { name, url: `/api/games/${this.game}/images/${name}` }; }
    read(filename: string): Promise<Buffer> {
        if (!IMAGE_FILENAME.test(filename))
            {throw new ApiError(404, 'Image not found.');}
        return this.repository.read(filename);
    }
    thumbnail(filename: string): Promise<Buffer> {
        if (!IMAGE_FILENAME.test(filename)) { throw new ApiError(404, 'Image not found.'); }
        return this.repository.thumbnail(filename);
    }
    private async describe(name: string) {
        return { ...this.item(name), ...await this.repository.info(name), thumbnailUrl: `${this.item(name).url}?thumbnail=1` };
    }
    async list() {
        const names = await this.repository.names();
        const images = [];
        const sorted = names.sort((a, b) => a.localeCompare(b));
        for (let offset = 0; offset < sorted.length; offset += 8) {
            images.push(...await Promise.all(sorted.slice(offset, offset + 8).map(async name => {
                const details = await this.repository.details(name);
                return { ...await this.describe(name), ...(details ? { details } : {}) };
            })));
        }
        return { images };
    }
    async saveDetails(filename: string, input: unknown) {
        const value = input as ImageDetails;
        const strings = ['title', 'category', 'tags', 'description', 'sourceName', 'sourceUrl'];
        if (!value || typeof value !== 'object' || Array.isArray(value) ||
            Object.keys(value).some((key) => ![...strings, 'width', 'height', 'categories'].includes(key)) ||
            strings.some((key) => value[key as keyof ImageDetails] !== globalThis.undefined && typeof value[key as keyof ImageDetails] !== 'string') ||
            (value.category && !Object.hasOwn(IMAGE_CATEGORIES, value.category)) ||
            (value.categories !== globalThis.undefined && (!Array.isArray(value.categories) || value.categories.length < 1 || value.categories.length > Object.keys(IMAGE_CATEGORIES).length || new Set(value.categories).size !== value.categories.length || value.categories.some(category => !Object.hasOwn(IMAGE_CATEGORIES, category)) || (value.category && !value.categories.includes(value.category)))) ||
            (value.sourceUrl && !httpUrl(value.sourceUrl)) ||
            [value.width, value.height].some((size) => size !== globalThis.undefined && (!Number.isSafeInteger(size) || size < 1 || size > 100000))) {
            throw new ApiError(400, 'Invalid image details or source page URL.');
        }
        for (const key of strings) {
            if (typeof value[key as keyof ImageDetails] === 'string')
                {(value as Record<string, unknown>)[key] = (value[key as keyof ImageDetails] as string).trim();}
        }
        // Older metadata editors do not send secondary roles; preserve those classifications.
        if (value.categories === globalThis.undefined) {
            const existing = await this.repository.details(filename);
            if (existing?.categories?.length) {
                value.categories = [...new Set([...existing.categories, ...(value.category ? [value.category] : [])])];
            }
        }
        await this.repository.writeDetails(filename, value);
        return { ...await this.describe(filename), details: value };
    }
    async upload(data: Buffer, original: string, category?: ImageCategory) {
        const extension = imageType(data);
        if (!extension)
            {throw new ApiError(415, 'The file contents are not recognized as PNG, JPEG, WebP, or GIF. Export the image in one of these formats and try again.');}
        const stem = original.replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'image';
        const name = `${stem}-${randomUUID()}.${extension}`;
        await this.repository.writeImage(name, data);
        if (category) { await this.repository.writeDetails(name, { category }); }
        return { ...await this.describe(name), ...(category ? { details: { category } } : {}) };
    }
}
