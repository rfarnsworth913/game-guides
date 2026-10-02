import dotenv from 'dotenv';
import { resolve } from 'node:path';

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
    return {
        uri,
        database,
        collection,
        port,
        origins: [`http://localhost:${uiPort}`, `http://127.0.0.1:${uiPort}`],
    };
}
