import { mkdtemp, readFile, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { writeRunReport } from './run-report';

it('leaves an interrupted run readable and retains the previous checkpoint when serialization fails', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'gg-run-report-'));
    const path = join(folder, 'report.json');
    try {
        await writeRunReport(path, { complete: false, success: false, games: ['genshin'] });
        await expect(writeRunReport(path, { invalid: 1n })).rejects.toThrow();
        expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ complete: false, success: false, games: ['genshin'] });
        await writeRunReport(path, { complete: true, success: false, errors: ['source unavailable'] });
        expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ complete: true, success: false });
    } finally {
        await unlink(path);
        await rmdir(folder);
    }
});
