import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { GAMES } from '../../../../lib/constants/workspace.constants';
import type { ImageDetails } from '../../../../lib/types/game-image.type';
import { httpUrl } from '../../../../common/quests/story-template';
import { ApiError } from '../../core/errors/app-error';
import { ImageRepository } from './images.repository';
import { IMAGE_FILENAME, imageType } from './images.schema';
export function gameImageFolder(id: string): string {
    const game = GAMES.find((game) => game.id === id);
    if (!game)
        throw new ApiError(404, 'Unknown game.');
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
            throw new ApiError(404, 'Image not found.');
        return this.repository.read(filename);
    }
    async list() {
        const names = await this.repository.names();
        return { images: await Promise.all(names.sort((a, b) => a.localeCompare(b)).map(async (name) => {
                const details = await this.repository.details(name);
                return { ...this.item(name), ...(details ? { details } : {}) };
            })) };
    }
    async saveDetails(filename: string, value: ImageDetails) {
        const strings = ['title', 'category', 'tags', 'description', 'sourceName', 'sourceUrl'];
        if (!value || typeof value !== 'object' || Array.isArray(value) ||
            Object.keys(value).some((key) => ![...strings, 'width', 'height'].includes(key)) ||
            strings.some((key) => value[key as keyof ImageDetails] !== undefined && typeof value[key as keyof ImageDetails] !== 'string') ||
            (value.category && !['banner', 'character', 'landscape', 'icon'].includes(value.category)) ||
            (value.sourceUrl && !httpUrl(value.sourceUrl)) ||
            [value.width, value.height].some((size) => size !== undefined && (!Number.isSafeInteger(size) || size < 1 || size > 100000))) {
            throw new ApiError(400, 'Invalid image details or source page URL.');
        }
        for (const key of strings) {
            if (typeof value[key as keyof ImageDetails] === 'string')
                (value as Record<string, unknown>)[key] = (value[key as keyof ImageDetails] as string).trim();
        }
        await this.repository.writeDetails(filename, value);
        return { ...this.item(filename), details: value };
    }
    async upload(data: Buffer, original: string) {
        const extension = imageType(data);
        if (!extension)
            throw new ApiError(415, 'The file contents are not recognized as PNG, JPEG, WebP, or GIF. Export the image in one of these formats and try again.');
        const stem = original.replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'image';
        const name = `${stem}-${randomUUID()}.${extension}`;
        await this.repository.writeImage(name, data);
        return this.item(name);
    }
}
