import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError } from '../../core/errors/app-error';
import { imageRoot } from './images.repository';
import { ImagesService } from './images.service';
import { IMAGE_TYPES, IMAGE_LIMIT } from './images.schema';
import { IMAGE_CATEGORIES } from '@lib/constants/image-category.constants';
import type { ImageCategory } from '@lib/types/game-image.type';
export async function handleGameImages(request: IncomingMessage, response: ServerResponse, id: string, filename: string | undefined, root = imageRoot): Promise<void> {
    const service = new ImagesService(root, id);
    const json = (status: number, body: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        response.end(JSON.stringify(body));
    };
    if (request.method === 'PUT' && filename) {
        await service.read(filename);
        if (!request.headers['content-type']?.startsWith('application/json'))
            {throw new ApiError(415, 'Use application/json.');}
        const bodyChunks: Buffer[] = [];
        let bodySize = 0;
        for await (const chunk of request as AsyncIterable<Buffer | string>) {
            const buffer = Buffer.from(chunk);
            bodySize += buffer.length;
            if (bodySize > 16384)
                {throw new ApiError(413, 'Image details are too large.');}
            bodyChunks.push(buffer);
        }
        let value: unknown;
        try {
            value = JSON.parse(Buffer.concat(bodyChunks).toString('utf8'));
        }
        catch {
            throw new ApiError(400, 'Invalid image details.');
        }
        json(200, await service.saveDetails(filename, value));
        return;
    }
    if (request.method === 'GET' && filename) {
        const thumbnail = new URL(request.url!, 'http://localhost').searchParams.get('thumbnail') === '1';
        const data = thumbnail ? await service.thumbnail(filename) : await service.read(filename);
        response.writeHead(200, { 'Content-Type': thumbnail ? 'image/webp' : IMAGE_TYPES[filename.split('.').at(-1)!], 'Content-Length': data.length, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
        response.end(data);
        return;
    }
    if (request.method === 'GET') {
        json(200, await service.list());
        return;
    }
    if (request.method !== 'POST' || filename)
        {throw new ApiError(405, 'Method not allowed.');}
    if (!Object.values(IMAGE_TYPES).includes(request.headers['content-type'] ?? ''))
        {throw new ApiError(415, 'Choose a PNG, JPEG, WebP, or GIF image.');}
    if (Number(request.headers['content-length']) > IMAGE_LIMIT)
        {throw new ApiError(413, 'Images must be 10 MB or smaller.');}
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request as AsyncIterable<Buffer | string>) {
        size += Buffer.byteLength(chunk);
        if (size > IMAGE_LIMIT)
            {throw new ApiError(413, 'Images must be 10 MB or smaller.');}
        chunks.push(Buffer.from(chunk));
    }
    const data = Buffer.concat(chunks);
    const original = new URL(request.url!, 'http://localhost').searchParams.get('name') ?? 'image';
    const category = new URL(request.url!, 'http://localhost').searchParams.get('category');
    if (category && !Object.hasOwn(IMAGE_CATEGORIES, category)) { throw new ApiError(400, 'Unsupported image category.'); }
    json(201, await service.upload(data, original, (category || globalThis.undefined) as ImageCategory | undefined));
}
