import { gameContentPath, readGameContent } from '../../src/modules/documents/game-configuration-document';
import { createDatabaseClient } from '../../src/core/database/connection';
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve, join } from 'node:path';
import { BSON, type ObjectId } from 'mongodb';
type Document = Record<string, unknown> & { _id?: ObjectId; name?: string; _revision?: number };
import { readConfig } from "../../src/config/environment";
import { migrateCharacterDocument } from '../../src/modules/characters/character-story-migration';

type BackupCollection = { name: string; filename: string; count: number; sha256: string; indexes: Document[] };
type BackupManifest = { createdAt: Date; database: string; catalog: string; collections: BackupCollection[] };
const canonical = (value: unknown) => BSON.EJSON.stringify(value, { relaxed: false });
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const config = readConfig();
const mode = process.argv[2];
if (!['--backup', '--plan', '--apply', '--verify'].includes(mode ?? '')) {throw new Error('Use --backup, --plan <backup directory>, --apply <backup directory>, or --verify <backup directory>.');}
const client = createDatabaseClient(config.uri);
try {
    if (mode === '--backup') {
        await client.connect();
        const db = client.db(config.database);
        const directory = resolve('backups', `shared-characters-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
        await mkdir(directory, { recursive: true });
        const collections: BackupCollection[] = [];
        for (const collection of await db.listCollections().toArray()) {
            if (collection.name.startsWith('system.') || collection.type !== 'collection') {continue;}
            const source = db.collection<Document>(collection.name);
            const documents = await source.find({}).toArray();
            const filename = Buffer.from(collection.name).toString('base64url') + '.ejson';
            const contents = canonical(documents);
            await writeFile(join(directory, filename), contents, { flag: 'wx' });
            const saved = await readFile(join(directory, filename), 'utf8');
            if ((BSON.EJSON.parse(saved) as unknown[]).length !== documents.length || saved !== contents) {throw new Error('Backup verification failed. No data has been changed.');}
            collections.push({ name: collection.name, filename, count: documents.length, sha256: digest(saved), indexes: await source.listIndexes().toArray() as Array<Document> });
        }
        await writeFile(join(directory, 'manifest.ejson'), canonical({ createdAt: new Date(), database: config.database, catalog: config.collection, collections }), { flag: 'wx' });
        console.log(JSON.stringify({ backup: directory, collections: collections.length, documents: collections.reduce((sum, collection) => sum + collection.count, 0), verified: true }));
    } else {
        if (!process.argv[3]) {throw new Error('A verified backup directory is required.');}
        const directory = resolve(process.argv[3]);
        const manifest = BSON.EJSON.parse(await readFile(join(directory, 'manifest.ejson'), 'utf8')) as BackupManifest;
        if (manifest.database !== config.database || manifest.catalog !== config.collection || !Array.isArray(manifest.collections)) {throw new Error('Backup does not match the configured database.');}
        let catalog: Document[] | undefined;
        for (const collection of manifest.collections) {
            if (!collection.filename || basename(collection.filename) !== collection.filename) {throw new Error('Invalid backup filename.');}
            const contents = await readFile(join(directory, collection.filename), 'utf8');
            const documents = BSON.EJSON.parse(contents) as Document[];
            if (digest(contents) !== collection.sha256 || !Array.isArray(documents) || documents.length !== collection.count) {throw new Error('Backup integrity check failed. No data has been changed.');}
            if (collection.name === config.collection) {catalog = documents;}
        }
        if (!catalog) {throw new Error('Catalog is missing from backup.');}
        const plans = catalog.map(document => ({ document, ...migrateCharacterDocument(document) })).filter(plan => plan.linked > 0);
        console.log(JSON.stringify({ mode, backup: directory, plans: plans.map(plan => ({ game: plan.document['name'], linked: plan.linked, created: plan.created })) }));
        if (mode === '--verify') {
            await client.connect();
            const db = client.db(config.database);
            for (const plan of plans) {
                const saved = await db.collection<Document>(config.collection).findOne({ _id: plan.document['_id'] });
                if (!saved || canonical(readGameContent(saved, 'story')) !== canonical(plan.story) || canonical(readGameContent(saved, 'characters')) !== canonical(plan.characters)) {throw new Error(`Shared character verification failed: ${plan.document['name']}. The game may have changed since migration.`);}
                for (const [field, original] of Object.entries((plan.document['content'] ?? {}) as Document)) {
                    if (!["story","characters"].includes(field) && canonical(readGameContent(saved, field)) !== canonical(original)) {throw new Error('Unrelated nested game content changed: ' + field);}
                }
                for (const [key, value] of Object.entries(plan.document)) {
                    if (!['story', 'characters', 'content', '_revision'].includes(key) && canonical(saved[key]) !== canonical(value)) {throw new Error(`Unrelated game field changed: ${plan.document['name']}/${key}.`);}
                }
            }
            for (const collection of manifest.collections.filter(item => item.name !== config.collection)) {
                const saved = await db.collection<Document>(collection.name).find({}).toArray();
                if (digest(canonical(saved)) !== collection.sha256) {throw new Error(`Collection changed since backup: ${collection.name}. Inspect whether another client wrote to it.`);}
            }
            console.log(JSON.stringify({ verified: true, guides: plans.reduce((sum, plan) => sum + plan.linked, 0), created: plans.reduce((sum, plan) => sum + plan.created, 0), unrelatedGameFieldsUnchanged: true, otherCollectionsUnchanged: true }));
        }
        if (mode === '--apply') {
            await client.connect();
            const collection = client.db(config.database).collection<Document>(config.collection);
            const pending = [];
            for (const plan of plans) {
                const current = await collection.findOne({ _id: plan.document['_id'] });
                if (!current) {throw new Error('A backed-up game no longer exists. No changes started.');}
                const revision = Number(plan.document['_revision'] ?? 0);
                if (canonical(readGameContent(current, 'story')) === canonical(plan.story) && canonical(readGameContent(current, 'characters')) === canonical(plan.characters) && Number(current['_revision']) === revision + 1) {continue;}
                if (canonical(readGameContent(current, 'story')) !== canonical(readGameContent(plan.document, 'story')) || canonical(readGameContent(current, 'characters')) !== canonical(readGameContent(plan.document, 'characters')) || Number(current['_revision'] ?? 0) !== revision) {throw new Error(`Game changed since backup: ${plan.document['name']}. Make a new backup before retrying.`);}
                pending.push({ ...plan, revision });
            }
            for (const plan of pending) {
                const result = await collection.updateOne({ _id: plan.document['_id'], _revision: plan.document['_revision'] ?? { $exists: false }, [gameContentPath(plan.document, 'story')]: readGameContent(plan.document, 'story'), [gameContentPath(plan.document, 'characters')]: readGameContent(plan.document, 'characters') ?? { $exists: false } }, { $set: { [gameContentPath(plan.document, 'story')]: plan.story, [gameContentPath(plan.document, 'characters')]: plan.characters, _revision: plan.revision + 1 } });
                if (result.matchedCount !== 1) {throw new Error(`Concurrent change prevented migration: ${plan.document['name']}. Earlier completed games are recorded in migration-journal.ndjson.`);}
                const saved = await collection.findOne({ _id: plan.document['_id'] });
                if (!saved || canonical(readGameContent(saved, 'story')) !== canonical(plan.story) || canonical(readGameContent(saved, 'characters')) !== canonical(plan.characters)) {throw new Error('Post-write verification failed. Keep the backup and journal for recovery.');}
                await appendFile(join(directory, 'migration-journal.ndjson'), JSON.stringify({ game: plan.document['name'], revision: plan.revision + 1, linked: plan.linked, at: new Date().toISOString() }) + '\n');
            }
            console.log(JSON.stringify({ verified: true, gamesUpdated: pending.length, linked: pending.reduce((sum, plan) => sum + plan.linked, 0), playerProgressChanged: false }));
        }
    }
} finally { await client.close(); }
