import 'dotenv/config';
import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { startDatabase, stopDatabase } from './database.mjs';

const port = Number(process.env.MIDDLEWARE_PORT || 3001);
const uiPort = Number(process.env.UI_PORT || 4200);
let database, middleware, ui;
let stopping = false;
async function portAvailable(port) {
    await new Promise((resolve, reject) => {
        const server = createServer();
        server.once('error', () =>
            reject(
                new Error(
                    `Port ${port} is already in use. Stop that application or change UI_PORT/MIDDLEWARE_PORT.`,
                ),
            ),
        );
        server.listen(port, '127.0.0.1', () => server.close(resolve));
    });
}
function childExited(child) {
    return !child || child.exitCode !== null || child.signalCode !== null;
}
async function stopChild(child, cooperative = false) {
    if (childExited(child)) {
        return;
    }
    if (cooperative && child.connected) {
        child.send('shutdown');
        await Promise.race([
            new Promise((resolve) => child.once('exit', resolve)),
            new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
        if (childExited(child)) {
            return;
        }
    }
    if (process.platform === 'win32') {
        await new Promise((resolve) =>
            execFile(
                'taskkill',
                ['/PID', String(child.pid), '/T', '/F'],
                { windowsHide: true },
                resolve,
            ),
        );
    } else {
        child.kill('SIGTERM');
    }
}
async function stop(code = 0) {
    if (stopping) {
        return;
    }
    stopping = true;
    await stopChild(ui);
    await stopChild(middleware, true);
    await stopDatabase(database);
    process.exit(code);
}
process.once('SIGINT', () => {
    stop().catch(() => process.exit(1));
});
process.once('SIGTERM', () => {
    stop().catch(() => process.exit(1));
});
process.on('message', (message) => {
    if (message === 'shutdown') {
        stop().catch(() => process.exit(1));
    }
});
function launch(args, ipc = false) {
    const child = spawn(process.execPath, args, {
        cwd: process.cwd(),
        env: process.env,
        windowsHide: true,
        stdio: ipc ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit',
    });
    child.on('error', () => {
        console.error('A required application process failed to start.');
        stop(1).catch(() => process.exit(1));
    });
    child.on('exit', () => {
        if (!stopping) {
            console.error('An application process exited; stopping the stack.');
            stop(1).catch(() => process.exit(1));
        }
    });
    return child;
}
try {
    if (!process.env.DB_CONN_STRING || !process.env.DB_NAME || !process.env.DB_COLLECTION) {
        throw new Error('Configure the root .env using .env.example before starting.');
    }
    await portAvailable(port);
    await portAvailable(uiPort);
    database = await startDatabase();
    middleware = launch(['--watch', '--watch-preserve-output', '--import', 'tsx', 'projects/middleware/src/main.ts'], true);
    let ready = false;
    for (let attempt = 0; attempt < 50 && !stopping; attempt++) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
                signal: AbortSignal.timeout(1000),
            });
            ready = response.ok;
        } catch {
            /* wait for connection */
        }
        if (ready) {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!ready) {
        throw new Error('Middleware did not become ready.');
    }
    ui = launch([
        resolve('node_modules/@angular/cli/bin/ng.js'),
        'serve',
        '--host',
        '127.0.0.1',
        '--port',
        String(uiPort),
        ...process.argv.slice(2),
    ]);
    console.log(
        `Application starting at http://localhost:${uiPort}. Ctrl+C stops the processes started here.`,
    );
} catch (error) {
    console.error(error.message);
    await stop(1);
}
