import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve, join } from 'node:path';
import { BSON, Document, MongoClient } from 'mongodb';
import { readConfig } from './config';
import { reworkMainQuestDocument } from './main-quest-document';

type BackupCollection = { name: string; filename: string; count: number; sha256: string; indexes: Document[] };
type BackupManifest = { createdAt: Date; database: string; catalog: string; collections: BackupCollection[] };
const canonical = (value: unknown) => BSON.EJSON.stringify(value, { relaxed: false });
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const config = readConfig();
const mode = process.argv[2];
const categories = process.argv.includes('--character-quests') ? ['side-stories'] as const : ['main-story'] as const;
if (!['--backup', '--plan', '--apply'].includes(mode ?? '')) throw new Error('Use --backup, --plan <backup directory>, or --apply <backup directory>.');
const client = new MongoClient(config.uri, { serverSelectionTimeoutMS: 5000 });
try {
    if (mode === '--backup') {
        await client.connect();
        const db = client.db(config.database);
        const directory = resolve('backups', `main-quests-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
        await mkdir(directory, { recursive: true });
        const collections: BackupCollection[] = [];
        for (const collection of await db.listCollections().toArray()) {
            if (collection.name.startsWith('system.') || collection.type !== 'collection') continue;
            const source = db.collection(collection.name);
            const documents = await source.find({}).toArray();
            const filename = Buffer.from(collection.name).toString('base64url') + '.ejson';
            const contents = canonical(documents);
            await writeFile(join(directory, filename), contents, { flag: 'wx' });
            const saved = await readFile(join(directory, filename), 'utf8');
            if (BSON.EJSON.parse(saved).length !== documents.length || saved !== contents) throw new Error('Backup verification failed. No data has been changed.');
            collections.push({ name: collection.name, filename, count: documents.length, sha256: digest(saved), indexes: await source.listIndexes().toArray() });
        }
        await writeFile(join(directory, 'manifest.ejson'), canonical({ createdAt: new Date(), database: config.database, catalog: config.collection, collections }), { flag: 'wx' });
        console.log(JSON.stringify({ backup: directory, collections: collections.length, documents: collections.reduce((sum, collection) => sum + collection.count, 0), verified: true }));
    } else {
        if (!process.argv[3]) throw new Error('A verified backup directory is required.');
        const directory = resolve(process.argv[3]);
        const manifest = BSON.EJSON.parse(await readFile(join(directory, 'manifest.ejson'), 'utf8')) as BackupManifest;
        if (manifest.database !== config.database || manifest.catalog !== config.collection || !Array.isArray(manifest.collections)) throw new Error('Backup does not match the configured database.');
        let catalog: Document[] | undefined;
        for (const collection of manifest.collections) {
            if (!collection.filename || basename(collection.filename) !== collection.filename) throw new Error('Invalid backup filename.');
            const contents = await readFile(join(directory, collection.filename), 'utf8');
            const documents = BSON.EJSON.parse(contents) as Document[];
            if (digest(contents) !== collection.sha256 || !Array.isArray(documents) || documents.length !== collection.count) throw new Error('Backup integrity check failed. No data has been changed.');
            if (collection.name === config.collection) catalog = documents;
        }
        if (!catalog) throw new Error('Catalog is missing from backup.');
        const plans = catalog.map(document => ({ document, ...reworkMainQuestDocument(document, categories) })).filter(plan => plan.guides > 0);
        console.log(JSON.stringify({ mode, categories, backup: directory, plans: plans.map(plan => ({ game: plan.document['name'], guides: plan.guides, promoted: plan.promoted, normalized: plan.normalized, review: plan.review })) }));
        if (mode === '--apply') {
            await client.connect();
            const collection = client.db(config.database).collection(config.collection);
            const pending = [];
            for (const plan of plans) {
                const current = await collection.findOne({ _id: plan.document['_id'] });
                if (!current) throw new Error('A backed-up game no longer exists. No changes started.');
                const revision = Number(plan.document['_revision'] ?? 0);
                if (canonical(current['story']) === canonical(plan.story) && Number(current['_revision']) === revision + 1) continue;
                if (canonical(current['story']) !== canonical(plan.document['story']) || Number(current['_revision'] ?? 0) !== revision) throw new Error(`Game changed since backup: ${plan.document['name']}. Make a new backup before retrying.`);
                pending.push({ ...plan, revision });
            }
            for (const plan of pending) {
                const result = await collection.updateOne({ _id: plan.document['_id'], _revision: plan.document['_revision'] ?? { $exists: false }, story: plan.document['story'] }, { $set: { story: plan.story, _revision: plan.revision + 1 } });
                if (result.matchedCount !== 1) throw new Error(`Concurrent change prevented migration: ${plan.document['name']}. Earlier completed games are recorded in migration-journal.ndjson.`);
                const saved = await collection.findOne({ _id: plan.document['_id'] });
                if (!saved || canonical(saved['story']) !== canonical(plan.story)) throw new Error('Post-write verification failed. Keep the backup and journal for recovery.');
                await appendFile(join(directory, 'migration-journal.ndjson'), JSON.stringify({ game: plan.document['name'], revision: plan.revision + 1, guides: plan.guides, at: new Date().toISOString() }) + '\n');
            }
            console.log(JSON.stringify({ verified: true, gamesUpdated: pending.length, guides: pending.reduce((sum, plan) => sum + plan.guides, 0), playerProgressChanged: false }));
        }
    }
} finally { await client.close(); }
