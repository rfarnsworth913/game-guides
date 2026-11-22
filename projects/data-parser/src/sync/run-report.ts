import { rename, unlink, writeFile } from 'node:fs/promises';

/** Preserve the last readable checkpoint if serialization or writing the next one fails. */
export async function writeRunReport(path: string, report: unknown): Promise<void> {
    const temporary = `${path}.${process.pid}.tmp`;
    const content = JSON.stringify(report, null, 2);
    try {
        await writeFile(temporary, content);
        await rename(temporary, path);
    } finally {
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') {throw error;}
        });
    }
}
