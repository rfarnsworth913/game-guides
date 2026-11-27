import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

async function tests(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const paths = await Promise.all(entries.map(entry => {
        const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
        return entry.isDirectory() ? tests(path) : entry.name.endsWith('.test.ts') ? [fileURLToPath(path)] : [];
    }));
    return paths.flat();
}
const args = process.argv.slice(2);
const security = args.includes('--security');
const coverage = args.includes('--coverage');
const files = (await tests(new URL('../src/', import.meta.url))).filter(file => !security ||
    file.replaceAll('\\', '/').endsWith('/auth.integration.test.ts') || file.replaceAll('\\', '/').endsWith('/auth0.provider.test.ts')).sort();
if (!files.length) throw new Error('No middleware tests discovered.');
const child = spawn(process.execPath, ['--import', 'tsx', '--test', ...(coverage ? ['--experimental-test-coverage'] : []), ...args.filter(arg => !['--security', '--coverage'].includes(arg)), ...files], { stdio: 'inherit', windowsHide: true,
    env: { ...process.env, ...(coverage ? { NODE_V8_COVERAGE: resolve('coverage/middleware') } : {}) } });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
