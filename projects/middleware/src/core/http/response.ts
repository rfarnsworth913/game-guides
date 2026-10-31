import type { ServerResponse } from 'node:http';
export const respond = (response: ServerResponse, status: number, body: unknown) => {
    if (status === 429)
        response.setHeader('Retry-After', '60');
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
    });
    response.end(JSON.stringify(body));
};
