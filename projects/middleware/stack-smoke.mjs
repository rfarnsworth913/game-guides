// Compatibility entry point: always use the isolated bearer-token harness.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

let active;
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => active?.kill(signal));
}
async function run(args) {
    active = spawn(process.execPath, args, { windowsHide: true, stdio: 'inherit' });
    const code = await new Promise((done, reject) => {
        active.once('error', reject);
        active.once('exit', (code, signal) => done(code ?? (signal ? 1 : 0)));
    });
    active = undefined;
    if (code !== 0) throw new Error(`Browser integration process exited with status ${code}.`);
}
try {
    await run([resolve('node_modules/@angular/cli/bin/ng.js'), 'build', '--configuration', 'e2e']);
    await run(['--import', 'tsx', 'projects/middleware/e2e/stack-smoke.ts']);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
