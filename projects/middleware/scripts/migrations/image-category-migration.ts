import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDatabaseClient } from '../../src/core/database/connection';
import { readConfig } from '../../src/config/environment';
import { imageRoot } from '../../src/modules/images/images.repository';
import { applyImageCategories, collectImageUses, planImageCategories } from '../../src/modules/images/image-category-migration';

const apply = process.argv.includes('--apply');
if (process.argv.slice(2).some(argument => !['--plan', '--apply'].includes(argument))) { throw new Error('Use --plan or --apply.'); }
const config = readConfig();
const client = createDatabaseClient(config.uri);
try {
    await client.connect();
    const documents = await client.db(config.database).collection(config.collection).find({}, { projection: { _id: 0 } }).toArray();
    const plan = await planImageCategories(imageRoot, collectImageUses(documents));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportDirectory = resolve('tmp', 'image-category-audit');
    await mkdir(reportDirectory, { recursive: true });
    const backup = resolve('backups', `image-categories-${stamp}`);
    const changed = apply ? await applyImageCategories(imageRoot, plan, backup) : 0;
    const counts: Record<string, number> = {};
    for (const item of plan) { for (const category of item.next.categories ?? []) { counts[category] = (counts[category] ?? 0) + 1; } }
    const report = { mode: apply ? 'apply' : 'plan', images: plan.length, changes: plan.filter(item => item.changed).length, written: changed,
        categories: counts, backup: apply ? backup : null, files: plan.map(item => ({ path: `${item.folder}/${item.filename}`, category: item.next.category,
            categories: item.next.categories, reason: item.reason, referenced: item.uses.length > 0, sha256: item.sha256 })) };
    const reportPath = resolve(reportDirectory, `${apply ? 'applied' : 'plan'}.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, files: globalThis.undefined, report: reportPath }, null, 2));
} catch (error) {
    console.error('Image categorization failed:', error instanceof Error ? error.name : 'Unknown error');
    process.exitCode = 1;
} finally { await client.close(); }
