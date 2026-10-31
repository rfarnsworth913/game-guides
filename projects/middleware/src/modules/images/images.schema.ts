export const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
export const IMAGE_FILENAME = /^[a-z0-9][a-z0-9-]*\.(png|jpg|webp|gif)$/;
export const IMAGE_LIMIT = 10 * 1024 * 1024;
/** Read signatures rather than trusting a browser's filename or MIME type. SVG is not accepted. */
export function imageType(data: Buffer): string | undefined {
    if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
        return 'png';
    if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255)
        return 'jpg';
    if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP')
        return 'webp';
    if (data.length >= 10 && ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6)))
        return 'gif';
    return undefined;
}
