import { BSON, Collection, Document } from 'mongodb';
import { CATALOG_FIELDS, CatalogEntry, GAMES, GameSnapshot } from '../../common/workspace';

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
    constructor(private readonly collection: Collection<Document>) {}
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
            const emptyCatalog: Record<string, unknown> = {
                schemaVersion: 1,
                revision: 0,
                updatedAt: new Date(),
            };
            for (const field of Object.values(CATALOG_FIELDS)) {
                emptyCatalog[field] = [];
            }
            await this.collection.updateOne(
                { name: gameDocumentName(game.id), catalog: { $exists: false } },
                { $set: { catalog: emptyCatalog } },
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
        const catalog = document['catalog'] as Record<string, unknown> | undefined;
        const entries = Object.values(CATALOG_FIELDS).flatMap(
            (field) => (catalog?.[field] ?? []) as CatalogEntry[],
        );
        return {
            id,
            name: GAMES.find((g) => g.id === id)!.name,
            revision: Number(catalog?.['revision'] ?? 0),
            entries,
        };
    }
    async parsed(id: string): Promise<Record<string, unknown>> {
        const document = await this.document(id);
        return Object.fromEntries(
            Object.entries(document).filter(([key]) => !['_id', 'catalog'].includes(key)),
        );
    }
    async write(id: string, entries: CatalogEntry[], revision: number): Promise<GameSnapshot> {
        const document = await this.document(id);
        const catalog: Record<string, unknown> = {
            schemaVersion: 1,
            revision: revision + 1,
            updatedAt: new Date(),
        };
        for (const [kind, field] of Object.entries(CATALOG_FIELDS)) {
            catalog[field] = entries.filter((e) => e.kind === kind);
        }
        // Keep room below MongoDB's 16 MiB single-document limit, including existing parser data.
        if (BSON.calculateObjectSize({ ...document, catalog }) > 15 * 1024 * 1024) {
            throw new ApiError(
                413,
                'This game document is too large. Export/archive data before adding more.',
            );
        }
        const expected =
            revision === 0
                ? { $or: [{ 'catalog.revision': 0 }, { 'catalog.revision': { $exists: false } }] }
                : { 'catalog.revision': revision };
        const result = await this.collection.updateOne(
            { _id: document['_id'], ...expected },
            { $set: { catalog } },
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
