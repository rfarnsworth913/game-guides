import type { IncomingMessage } from 'node:http';
import { ApiError } from '../errors/app-error';
export function createRateLimiter() {
    const limits = new Map<string, {
        count: number;
        reset: number;
    }>();
    const rateLimit = (request: IncomingMessage, auth: boolean) => {
        const key = (request.socket.remoteAddress ?? 'unknown') + (auth ? '/auth' : '/write');
        const now = Date.now();
        for (const [id, item] of limits)
            {if (item.reset < now)
                {limits.delete(id);}}
        const item = limits.get(key) ?? { count: 0, reset: now + 60000 };
        if (limits.size >= 10000 && !limits.has(key))
            {throw new ApiError(429, 'Too many requests. Try again later.');}
        if (++item.count > (auth ? 30 : 180))
            {throw new ApiError(429, 'Too many requests. Try again later.');}
        limits.set(key, item);
    };
    return rateLimit;
}
