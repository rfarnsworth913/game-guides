import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IncomingMessage, ServerResponse } from 'node:http';
import { GAMES } from '../../common/workspace';
import { ApiError } from './repository';
import { ImageDetails } from '../../common/game-images';
import { httpUrl } from '../../common/story-template';

export const imageRoot = fileURLToPath(new URL('../../guides-app/src/assets/', import.meta.url));
const types: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const filenamePattern = /^[a-z0-9][a-z0-9-]*\.(png|jpg|webp|gif)$/;
const limit = 10 * 1024 * 1024;

export function gameImageFolder(id: string): string {
    const game = GAMES.find((game) => game.id === id);
    if (!game) throw new ApiError(404, 'Unknown game.');
    return game.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Read signatures rather than trusting a browser's filename or MIME type. SVG is not accepted. */
function imageType(data: Buffer): string | undefined {
    if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
    if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return 'jpg';
    if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    if (data.length >= 10 && ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6))) return 'gif';
    return undefined;
}

export async function handleGameImages(
    request: IncomingMessage,
    response: ServerResponse,
    id: string,
    filename: string | undefined,
    root = imageRoot,
): Promise<void> {
    const folder = join(root, gameImageFolder(id));
    const item = (name: string) => ({ name, url: `/api/games/${id}/images/${name}` });
    const detailsFor = async (name: string): Promise<ImageDetails | undefined> => {
        try { return JSON.parse(await readFile(join(folder, `${name}.json`), 'utf8')); }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
            throw error;
        }
    };
    const json = (status: number, body: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        response.end(JSON.stringify(body));
    };
    if (request.method === 'PUT' && filename) {
        if (!filenamePattern.test(filename)) throw new ApiError(404, 'Image not found.');
        try { await readFile(join(folder, filename)); }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ApiError(404, 'Image not found.');
            throw error;
        }
        if (!request.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, 'Use application/json.');
        const bodyChunks: Buffer[] = [];
        let bodySize = 0;
        for await (const chunk of request) {
            const buffer = Buffer.from(chunk);
            bodySize += buffer.length;
            if (bodySize > 16384) throw new ApiError(413, 'Image details are too large.');
            bodyChunks.push(buffer);
        }
        let value: ImageDetails;
        try { value = JSON.parse(Buffer.concat(bodyChunks).toString('utf8')); } catch { throw new ApiError(400, 'Invalid image details.'); }
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
            if (typeof value[key as keyof ImageDetails] === 'string') (value as Record<string, unknown>)[key] = (value[key as keyof ImageDetails] as string).trim();
        }
        const temporary = join(folder, `${filename}.${randomUUID()}.tmp`);
        await writeFile(temporary, JSON.stringify(value), { flag: 'wx' });
        await rename(temporary, join(folder, `${filename}.json`));
        json(200, { ...item(filename), details: value });
        return;
    }
    if (request.method === 'GET' && filename) {
        if (!filenamePattern.test(filename)) throw new ApiError(404, 'Image not found.');
        let data: Buffer;
        try { data = await readFile(join(folder, filename)); }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ApiError(404, 'Image not found.');
            throw error;
        }
        response.writeHead(200, { 'Content-Type': types[filename.split('.').at(-1)!], 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
        response.end(data);
        return;
    }
    if (request.method === 'GET') {
        let names: string[];
        try { names = (await readdir(folder, { withFileTypes: true })).filter((entry) => entry.isFile() && filenamePattern.test(entry.name)).map((entry) => entry.name); }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            names = [];
        }
        json(200, { images: await Promise.all(names.sort((a, b) => a.localeCompare(b)).map(async (name) => {
            const details = await detailsFor(name);
            return { ...item(name), ...(details ? { details } : {}) };
        })) });
        return;
    }
    if (request.method !== 'POST' || filename) throw new ApiError(405, 'Method not allowed.');
    if (!Object.values(types).includes(request.headers['content-type'] ?? '')) throw new ApiError(415, 'Choose a PNG, JPEG, WebP, or GIF image.');
    if (Number(request.headers['content-length']) > limit) throw new ApiError(413, 'Images must be 10 MB or smaller.');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
        size += Buffer.byteLength(chunk);
        if (size > limit) throw new ApiError(413, 'Images must be 10 MB or smaller.');
        chunks.push(Buffer.from(chunk));
    }
    const data = Buffer.concat(chunks);
    const extension = imageType(data);
    if (!extension) throw new ApiError(415, 'The file contents are not recognized as PNG, JPEG, WebP, or GIF. Export the image in one of these formats and try again.');
    const original = new URL(request.url!, 'http://localhost').searchParams.get('name') ?? 'image';
    const stem = original.replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'image';
    const name = `${stem}-${randomUUID()}.${extension}`;
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, name), data, { flag: 'wx' });
    json(201, item(name));
}
