import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameImage, ImageDetails } from '@lib/types/game-image.type';
import { ApiError } from '../../core/errors/app-error';
import { IMAGE_FILENAME } from './images.schema';
import sharp from 'sharp';
type FileInfo = Pick<GameImage, 'width' | 'height' | 'format' | 'fileSize' | 'createdAt' | 'updatedAt'>;
const metadataCache = new Map<string, { stamp: string; result: Promise<FileInfo> }>();
const thumbnailCache = new Map<string, Promise<Buffer>>();
export const imageRoot = fileURLToPath(new URL('../../../../guides-app/src/assets/', import.meta.url));
/** Filesystem persistence stays separate from HTTP and metadata validation. */
export class ImageRepository {
    constructor(private readonly folder: string) { }
    async read(name: string): Promise<Buffer> {
        try {
            return await readFile(join(this.folder, name));
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT')
                {throw new ApiError(404, 'Image not found.');}
            throw error;
        }
    }
    async details(name: string): Promise<ImageDetails | undefined> {
        try {
            return JSON.parse(await readFile(join(this.folder, `${name}.json`), 'utf8')) as ImageDetails;
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT')
                {return globalThis.undefined;}
            throw error;
        }
    }
    async names(): Promise<string[]> {
        try {
            return (await readdir(this.folder, { withFileTypes: true })).filter(entry => entry.isFile() && IMAGE_FILENAME.test(entry.name)).map(entry => entry.name);
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                {throw error;}
            return [];
        }
    }
    async info(name: string): Promise<FileInfo> {
        const path = join(this.folder, name);
        const file = await stat(path);
        const stamp = `${file.mtimeMs}/${file.size}`;
        const cached = metadataCache.get(path);
        if (cached?.stamp === stamp) { return cached.result; }
        const result = (async () => {
            const basic = { fileSize: file.size, format: name.split('.').at(-1), createdAt: file.birthtime.toISOString(), updatedAt: file.mtime.toISOString() };
            try {
                const image = await sharp(await readFile(path), { limitInputPixels: 40_000_000 }).metadata();
                const swapped = image.orientation && image.orientation >= 5;
                return { ...basic, width: swapped ? image.height : image.width, height: swapped ? image.width : image.height };
            } catch { return basic; }
        })();
        if (metadataCache.size >= 512) { metadataCache.delete(metadataCache.keys().next().value!); }
        metadataCache.set(path, { stamp, result });
        return result;
    }
    async thumbnail(name: string): Promise<Buffer> {
        const path = join(this.folder, name);
        const file = await stat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') { throw new ApiError(404, 'Image not found.'); } throw error; });
        const key = `${path}/${file.mtimeMs}/${file.size}`;
        const cached = thumbnailCache.get(key);
        if (cached) { return cached; }
        // Derivatives are bounded and cached in memory; original files/metadata are never rewritten.
        const result = sharp(path, { limitInputPixels: 40_000_000, failOn: 'none' }).rotate()
            .resize(480, 360, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer()
            .catch(() => { thumbnailCache.delete(key); throw new ApiError(415, 'Image preview unavailable.'); });
        if (thumbnailCache.size >= 32) { thumbnailCache.delete(thumbnailCache.keys().next().value!); }
        thumbnailCache.set(key, result);
        return result;
    }
    async writeDetails(filename: string, details: ImageDetails): Promise<void> {
        const temporary = join(this.folder, `${filename}.${randomUUID()}.tmp`);
        await writeFile(temporary, JSON.stringify(details), { flag: 'wx' });
        await rename(temporary, join(this.folder, `${filename}.json`));
    }
    async writeImage(name: string, data: Buffer): Promise<void> {
        await mkdir(this.folder, { recursive: true });
        await writeFile(join(this.folder, name), data, { flag: 'wx' });
    }
}
