import { ApiError } from '../../core/errors/app-error';
import { BSON, Collection, Document } from 'mongodb';
import type { CatalogEntry, GameSnapshot } from "../../../../lib/types/workspace.type";
import { GAMES } from "../../../../lib/constants/workspace.constants";
import { decodeEntries, mergeEntries, migrateDocument } from "../documents/game-document";
import { normalizeStory } from "../documents/stories/story-document";
import type { CharacterRules } from "../../../../lib/types/character.type";
import { characterDefinitionFits, validCharacterRules } from "../../../../common/characters/characters";
import type { GameOverview } from '../../../../lib/types/game-overview.type';
import { defaultGameOverview, gameOverviewErrors, normalizeGameColor, validGameId, validGameOverview } from '../../../../common/workspace/game-overview';

// Match parser source IDs exactly; the UI display name for HSR includes a colon.
export const gameDocumentName = (id: string) =>
    id === 'hsr' ? 'Honkai Star Rail' : GAMES.find((g) => g.id === id)?.name;
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
        await this.collection.createIndex({ _gameId: 1 }, { unique: true, partialFilterExpression: { _gameId: { $type: 'string' } } });
        for (const game of GAMES) {
            await this.collection.updateOne(
                { name: gameDocumentName(game.id) },
                { $setOnInsert: { name: gameDocumentName(game.id) } },
                { upsert: true },
            );
            await this.collection.updateOne({ name: gameDocumentName(game.id), _gameId: { $exists: false } },
                { $set: { _gameId: game.id, _gameOverview: defaultGameOverview(game.id) } });
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
            const migrated: Record<string, unknown> = { ...document, ...fields };
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
        if (!validGameId(id)) {throw new ApiError(404, 'Unknown game.');}
        const name = gameDocumentName(id);
        const document = await this.collection.findOne(name ? { name } : { _gameId: id });
        if (!document) {
            throw new ApiError(404, 'Game document not found.');
        }
        return document;
    }
    private overview(id: string, document: Document): GameOverview {
        return validGameOverview(document['_gameOverview']) ? document['_gameOverview'] : defaultGameOverview(id);
    }
    async list(includeArchived = false): Promise<GameOverview[]> {
        const documents = await this.collection.find({ _gameId: { $type: 'string' } }).toArray();
        return documents.map(document => this.overview(String(document['_gameId']), document))
            .filter(game => includeArchived || !game.archived).sort((a, b) => a.name.localeCompare(b.name));
    }
    async saveOverview(input: unknown, create = false): Promise<GameOverview> {
        if (!validGameOverview(input)) {throw new ApiError(400, Object.values(gameOverviewErrors(input)).join(' '));}
        const game: GameOverview = { ...input, name: input.name.trim(), short: input.short.trim(),
            subtitle: input.subtitle.trim(), description: input.description.trim(), gameType: input.gameType.trim(),
            features: [...input.features], archived: create ? false : input.archived,
            color: normalizeGameColor(input.color) ?? input.color, revision: create ? 0 : input.revision + 1 };
        if (create) {
            if (GAMES.some(item => item.id === game.id) || await this.collection.findOne({ _gameId: game.id })) {
                throw new ApiError(409, 'This game ID is already reserved. Edit or restore the existing game instead.');
            }
            try {
                await this.collection.insertOne({ name: `game:${game.id}`, _gameId: game.id, _gameOverview: game,
                    _schemaVersion: 2, _revision: 0, achievements: [], characters: [], events: [], inventory: [], plans: [], story: [], teams: [] });
            } catch (error) {
                if ((error as { code?: number }).code === 11000) {throw new ApiError(409, 'This game ID already exists.');}
                throw error;
            }
        } else {
            const document = await this.document(game.id);
            const result = await this.collection.updateOne({ _id: document['_id'] as import('mongodb').ObjectId, '_gameOverview.revision': input.revision }, { $set: { _gameOverview: game } });
            if (!result.matchedCount) {throw new ApiError(409, 'This game overview changed in another session. Reload the game list before saving.');}
        }
        return game;
    }
    async archive(id: string, revision: number): Promise<GameOverview> {
        const document = await this.document(id);
        return this.saveOverview({ ...this.overview(id, document), archived: true, revision });
    }
    async read(id: string): Promise<GameSnapshot> {
        const document = await this.document(id);
        const overview = this.overview(id, document);
        if (overview.archived) {throw new ApiError(404, 'This game has been removed. An editor can restore it.');}
        const entries = decodeEntries(document, id);
        return {
            id,
            name: overview.name,
            overview,
            revision: Number(document['_revision'] ?? 0),
            entries,
            ...(validCharacterRules(document['characterRules']) ? { characterRules: document['characterRules'] } : {}),
        };
    }
    async parsed(id: string): Promise<Record<string, unknown>> {
        const document = await this.document(id);
        if (this.overview(id, document).archived) {throw new ApiError(404, 'This game has been removed.');}
        return Object.fromEntries(
            Object.entries(document).filter(
                ([key]) => !['_id', '_schemaVersion', '_revision', '_gameOverview', '_gameId'].includes(key),
            ),
        );
    }
    async write(id: string, entries: CatalogEntry[], revision: number, characterRules?: CharacterRules): Promise<GameSnapshot> {
        entries = normalizeStory(entries);
        const document = await this.document(id);
        const overview = this.overview(id, document);
        if (overview.archived) {throw new ApiError(404, 'This game has been removed.');}
        const rules: unknown = characterRules ?? document['characterRules'];
        if (rules !== globalThis.undefined && !validCharacterRules(rules)) {throw new ApiError(400, 'Invalid character rules.');}
        const farmingSources = validCharacterRules(rules) ? rules.farming?.sources ?? [] : [];
        if (farmingSources.some(source => source.materialIds.some(id => !entries.some(entry => entry.id === id && entry.kind === 'inventory')))) {
            throw new ApiError(400, 'Farming sources must reference materials in this game’s inventory catalog.');
        }
        if (rules && entries.some(entry => entry.characterDefinition && !characterDefinitionFits(entry.characterDefinition, entry.rarity, rules))) {
            throw new ApiError(400, 'Character definitions do not match the game\'s rarity, weapon, damage, or role options. Update the options or definitions together.');
        }
        const fields = { ...mergeEntries(document, entries), ...(rules ? { characterRules: rules } : {}), _revision: revision + 1 };
        this.checkSize({ ...document, ...fields });
        const result = await this.collection.updateOne(
            { _id: document['_id'] as import('mongodb').ObjectId, _revision: revision, '_gameOverview.archived': { $ne: true } },
            { $set: fields },
        );
        if (result.matchedCount !== 1) {
            throw new ApiError(
                409,
                'This game changed in another session. Reload game data before saving again.',
            );
        }
        return { id, name: overview.name, overview, revision: revision + 1, entries, ...(rules ? { characterRules: rules } : {}) };
    }
}
