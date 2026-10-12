import { BSON, Collection, Document } from 'mongodb';
import { CatalogEntry, GAMES, GameSnapshot } from '../../common/workspace';
import { decodeEntries, mergeEntries, migrateDocument } from './game-document';
import { normalizeStory } from './story-document';

// Match parser source IDs exactly; the UI display name for HSR includes a colon.
export const gameDocumentName = (id: string) =>
    id === 'hsr' ? 'Honkai Star Rail' : GAMES.find((g) => g.id === id)?.name;
export class ApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}
export class GameRepository {
    constructor(
        private readonly collection: Collection<Document>,
        private readonly backups: Collection<Document>,
    ) {}
    async initialize(): Promise<void> {
        await this.collection.createIndex(
            { name: 1 },
            { unique: true, partialFilterExpression: { name: { $type: 'string' } } },
        );
        for (const game of GAMES) {
            await this.collection.updateOne(
                { name: gameDocumentName(game.id) },
                { $setOnInsert: { name: gameDocumentName(game.id) } },
                { upsert: true },
            );
        }
        // Include parser-only games. Back up the original once, before any schema changes.
        for await (const document of this.collection.find({
            $or: [
                { _schemaVersion: { $ne: 2 } },
                { 'achievements.order': { $type: 'string' } },
                { 'achievements.achievements.order': { $type: 'string' } },
                { 'story.kind': 'story' },
            ],
        })) {
            await this.backups.updateOne(
                { _id: document['_id'] },
                { $setOnInsert: document },
                { upsert: true },
            );
            const fields = migrateDocument(document);
            const migrated = { ...document, ...fields };
            delete migrated['catalog'];
            this.checkSize(migrated);
            const result = await this.collection.updateOne(document, {
                $set: fields,
                $unset: { catalog: '' },
            });
            if (result.matchedCount !== 1) {
                throw new Error('Game changed during migration. Restart middleware to retry.');
            }
        }
    }
    private checkSize(document: Document): void {
        if (BSON.calculateObjectSize(document) > 15 * 1024 * 1024) {
            throw new ApiError(
                413,
                'This game document is too large. Export/archive data before adding more.',
            );
        }
    }
    async document(id: string): Promise<Document> {
        const name = gameDocumentName(id);
        if (!name) {
            throw new ApiError(404, 'Unknown game.');
        }
        const document = await this.collection.findOne({ name });
        if (!document) {
            throw new ApiError(404, 'Game document not found.');
        }
        return document;
    }
    async read(id: string): Promise<GameSnapshot> {
        const document = await this.document(id);
        const entries = decodeEntries(document, id);
        return {
            id,
            name: GAMES.find((g) => g.id === id)!.name,
            revision: Number(document['_revision'] ?? 0),
            entries,
        };
    }
    async parsed(id: string): Promise<Record<string, unknown>> {
        const document = await this.document(id);
        return Object.fromEntries(
            Object.entries(document).filter(
                ([key]) => !['_id', '_schemaVersion', '_revision'].includes(key),
            ),
        );
    }
    async write(id: string, entries: CatalogEntry[], revision: number): Promise<GameSnapshot> {
        entries = normalizeStory(entries);
        const document = await this.document(id);
        const fields = { ...mergeEntries(document, entries), _revision: revision + 1 };
        this.checkSize({ ...document, ...fields });
        const result = await this.collection.updateOne(
            { _id: document['_id'], _revision: revision },
            { $set: fields },
        );
        if (result.matchedCount !== 1) {
            throw new ApiError(
                409,
                'This game changed in another session. Reload game data before saving again.',
            );
        }
        return { id, name: GAMES.find((g) => g.id === id)!.name, revision: revision + 1, entries };
    }
}
