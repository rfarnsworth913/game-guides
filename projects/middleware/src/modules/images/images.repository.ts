import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ImageDetails } from '../../../../lib/types/game-image.type';
import { ApiError } from '../../core/errors/app-error';
import { IMAGE_FILENAME } from './images.schema';
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
                throw new ApiError(404, 'Image not found.');
            throw error;
        }
    }
    async details(name: string): Promise<ImageDetails | undefined> {
        try {
            return JSON.parse(await readFile(join(this.folder, `${name}.json`), 'utf8')) as ImageDetails;
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT')
                return undefined;
            throw error;
        }
    }
    async names(): Promise<string[]> {
        try {
            return (await readdir(this.folder, { withFileTypes: true })).filter(entry => entry.isFile() && IMAGE_FILENAME.test(entry.name)).map(entry => entry.name);
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                throw error;
            return [];
        }
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
