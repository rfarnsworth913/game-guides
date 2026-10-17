import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { AUTH0_PUBLIC } from '../../common/auth0-config';

// Identical environment keys to projects/data-parser/src/services/data-service.ts.
export function readConfig() {
    dotenv.config({ path: resolve(process.cwd(), '.env') });
    const uri = process.env['DB_CONN_STRING'];
    const database = process.env['DB_NAME'];
    const collection = process.env['DB_COLLECTION'];
    if (!uri || !database || !collection) {
        throw new Error(
            'Set DB_CONN_STRING, DB_NAME and DB_COLLECTION in the root .env (the parser configuration).',
        );
    }
    const port = Number(process.env['MIDDLEWARE_PORT'] ?? 3001);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Invalid MIDDLEWARE_PORT.');
    }
    const uiPort = Number(process.env['UI_PORT'] ?? 4200);
    const origin = new URL(process.env['APP_ORIGIN'] ?? 'http://localhost:' + uiPort);
    const production = process.env['NODE_ENV'] === 'production';
    if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password ||
        (origin.protocol !== 'https:' && (production || origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)))) {
        throw new Error('APP_ORIGIN must be an HTTPS origin (HTTP is allowed only for local development).');
    }
    return {
        uri,
        database,
        collection,
        port,
        origins: [origin.origin],
        auth0: { ...AUTH0_PUBLIC, origin: origin.origin,
            editors: (process.env['AUTH0_EDITOR_SUBJECTS'] ?? process.env['OIDC_EDITOR_SUBJECTS'] ?? '').split(',').map((value) => value.trim()).filter(Boolean) },
    };
}
