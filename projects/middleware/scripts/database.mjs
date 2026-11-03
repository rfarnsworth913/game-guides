import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function databaseReady() {
    const client = new MongoClient(process.env.DB_CONN_STRING || 'mongodb://127.0.0.1:27017', {
        serverSelectionTimeoutMS: 800,
    });
    try {
        await client.connect();
        await client.db(process.env.DB_NAME).command({ ping: 1 });
        return true;
    } catch {
        return false;
    } finally {
        await client.close();
    }
}
export async function startDatabase() {
    if (await databaseReady()) {
        console.log('Using the running MongoDB instance.');
        return null;
    }
    const uri = new URL(process.env.DB_CONN_STRING || 'mongodb://127.0.0.1:27017');
    if (!['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname)) {
        throw new Error(
            'The configured remote MongoDB instance is unavailable; start it before launching the app.',
        );
    }
    const bundled = resolve(
        'projects/database',
        process.platform === 'win32' ? 'mongod.exe' : 'mongod',
    );
    const executable = process.env.MONGOD_PATH || (existsSync(bundled) ? bundled : 'mongod');
    const config = resolve('projects/database/mongod.cfg');
    const directory = resolve('projects/database/db');
    mkdirSync(directory, { recursive: true });
    const log = openSync(resolve(directory, 'application-mongod.log'), 'a');
    const args = existsSync(config) ? ['--config', config] : ['--dbpath', directory];
    args.push('--bind_ip', '127.0.0.1', '--port', uri.port || '27017');
    const child = spawn(executable, args, {
        cwd: process.cwd(),
        windowsHide: true,
        stdio: ['ignore', log, log],
    });
    closeSync(log);
    let failed = false;
    child.once('error', () => {
        failed = true;
    });
    child.once('exit', () => {
        failed = true;
    });
    for (let attempt = 0; attempt < 35; attempt++) {
        if (failed) {
            throw new Error(
                'MongoDB could not start. Check MONGOD_PATH and projects/database/db/application-mongod.log.',
            );
        }
        if (await databaseReady()) {
            console.log('MongoDB ready.');
            return child;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    // Never force-kill the database: leave it available for inspection if readiness failed.
    throw new Error(
        'MongoDB did not become ready. Inspect projects/database/db/application-mongod.log.',
    );
}
export async function stopDatabase(child) {
    if (!child || child.exitCode !== null) {
        return;
    }
    const client = new MongoClient(process.env.DB_CONN_STRING || 'mongodb://127.0.0.1:27017', {
        serverSelectionTimeoutMS: 1500,
    });
    try {
        await client.connect();
        await client.db('admin').command({ shutdown: 1 });
    } catch {
        /* MongoDB closes the socket during a successful shutdown. */
    } finally {
        await client.close();
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        const child = await startDatabase();
        const stop = () => stopDatabase(child).then(() => process.exit(0));
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
