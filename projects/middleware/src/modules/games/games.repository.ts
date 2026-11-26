import { ApiError } from '../../core/errors/app-error';
import {inventoryReferenceIssues} from '@common/inventory/inventory-config';
import { BSON, Collection, Document } from 'mongodb';
import type { CatalogEntry, GameSnapshot } from "@lib/types/workspace.type";
import { GAMES } from "@lib/constants/workspace.constants";
import { decodeEntries, mergeEntries, migrateDocument } from "../documents/game-document";
import { normalizeStory } from "../documents/stories/story-document";
import type { CharacterRules } from "@lib/types/character.type";
import { characterDefinitionFits, validCharacterRules } from "@common/characters/characters";
import { characterRulesCompatibility } from '@common/characters/character-rules';
import type { GameRegistration } from '@lib/types/games.type';
import { defaultGameOverview, gameOverviewErrors, normalizeGameColor, validGameId, validGameOverview } from '@common/workspace/game-overview';
import { configurationFields, documentConfiguration, flatGameDocument, GAME_CONTENT_FIELDS, hasStoredGameIdentity, storedGameId } from '../documents/game-configuration-document';

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
                { _schemaVersion: { $nin: [2, 3] } },
                { 'achievements.order': { $type: 'string' } },
                { 'achievements.achievements.order': { $type: 'string' } },
                { 'story.kind': 'story' },
            ],
        })) {
            if (!hasStoredGameIdentity(document)) {continue;}
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
        // One-time, backed-up transition; content IDs and player progress are unchanged.
        for await (const document of this.collection.find({ _schemaVersion: { $ne: 3 } })) {
            if (!hasStoredGameIdentity(document)) {
                console.warn(`Skipped unidentified game record ${String(document['_id'])}; original data preserved.`);
                continue;
            }
            const id = storedGameId(document);
            const fields = configurationFields(document, id);
            await this.backups.updateOne({ migration: 'game-configuration-v3', originalId: document['_id'] },
                { $setOnInsert: { original: document, migration: 'game-configuration-v3' } }, { upsert: true });
            const migrated = { ...document, ...fields };
            for (const key of GAME_CONTENT_FIELDS) {Reflect.deleteProperty(migrated, key);}
            Reflect.deleteProperty(migrated, '_gameOverview');
            this.checkSize(migrated);
            const result = await this.collection.updateOne(document, { $set: { ...fields, _gameId: id, _schemaVersion: 3 },
                $unset: Object.fromEntries([...GAME_CONTENT_FIELDS, '_gameOverview'].map(key => [key, ''])) });
            if (result.matchedCount !== 1) {throw new Error('Game changed during configuration migration. Restart middleware to retry.');}
        }
        // Normalize the former genre/aliases fields without rewriting content or revisions.
        for await (const document of this.collection.find({ _schemaVersion: 3, $or: [
            { 'gameConfiguration.genre': { $exists: true } },
            { 'gameConfiguration.searchAliases': { $exists: true } },
            { 'gameConfiguration.genres': { $exists: false } },
        ] })) {
            if (!hasStoredGameIdentity(document)) {continue;}
            const id = storedGameId(document);
            const { gameId: _identity, ...gameConfiguration } = documentConfiguration(document, id);
            await this.backups.updateOne({ migration: 'game-genres-v1', originalId: document['_id'] },
                { $setOnInsert: { original: document, migration: 'game-genres-v1' } }, { upsert: true });
            const result = await this.collection.updateOne({ _id: document['_id'], gameConfiguration: document['gameConfiguration'] }, { $set: { gameConfiguration } });
            if (result.matchedCount !== 1) {throw new Error('Game changed during genre migration. Restart middleware to retry.');}
        }
        await this.collection.createIndex({ gameId: 1 }, { unique: true, partialFilterExpression: { gameId: { $type: 'string' } } });
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
        return flatGameDocument(document);
    }
    private overview(id: string, document: Document): GameRegistration {
        return documentConfiguration(document, id);
    }
    async list(_includeRestricted = false): Promise<GameRegistration[]> {
        const documents = await this.collection.find({ _gameId: { $type: 'string' } }, {projection:{_gameId:1,gameConfiguration:1,_gameOverview:1,name:1}}).toArray();
        return documents.map(document => this.overview(String(document['_gameId']), document))
            .sort((a, b) => a.name.localeCompare(b.name));
    }
    async saveOverview(input: unknown, create = false): Promise<GameRegistration> {
        if (!validGameOverview(input)) {throw new ApiError(400, Object.values(gameOverviewErrors(input)).join(' '));}
        const game: GameRegistration = { ...input, name: input.name.trim(), short: input.short.trim(),
            subtitle: input.subtitle.trim(), description: input.description.trim(), genres: [...new Set(input.genres.map(genre=>genre.trim()))],
            features: structuredClone(input.features),
            updatedAt: new Date().toISOString(),
            color: normalizeGameColor(input.color) ?? input.color, revision: create ? 0 : input.revision + 1 };
        if (create) {
            game.createdAt=game.updatedAt;
            if (GAMES.some(item => item.id === game.gameId) || await this.collection.findOne({ _gameId: game.gameId })) {
                throw new ApiError(409, 'This game ID is already reserved. Edit or restore the existing game instead.');
            }
            try {
                const { gameId: id, ...gameConfiguration } = game;
                await this.collection.insertOne({ name: `game:${id}`, _gameId: id, gameId: id, gameConfiguration,
                    version: { title: '', url: '', releaseDate: null }, content: {}, _schemaVersion: 3, _revision: 0 });
            } catch (error) {
                if ((error as { code?: number }).code === 11000) {throw new ApiError(409, 'This game ID already exists.');}
                throw error;
            }
        } else {
            const document = await this.document(game.gameId);
            const createdAt=this.overview(game.gameId,document).createdAt;
            if(createdAt) {game.createdAt=createdAt;} else {delete game.createdAt;}
            const { gameId: _id, ...gameConfiguration } = game;
            const revisionField = document['gameConfiguration'] ? 'gameConfiguration.revision' : '_gameOverview.revision';
            const result = await this.collection.updateOne({ _id: document['_id'] as import('mongodb').ObjectId, [revisionField]: input.revision }, { $set: { gameConfiguration } });
            if (!result.matchedCount) {throw new ApiError(409, 'This game overview changed in another session. Reload the game list before saving.');}
        }
        return game;
    }
    /** Compatibility for old remove requests: restrict workspace access, never delete shared data. */
    async archive(id: string, revision: number): Promise<GameRegistration> {
        const document = await this.document(id);
        return this.saveOverview({ ...this.overview(id, document), visibility: 'editors', revision });
    }
    async read(id: string): Promise<GameSnapshot> {
        const document = await this.document(id);
        const overview = this.overview(id, document);
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
        return Object.fromEntries(
            Object.entries(document).filter(
                ([key]) => !['_id', '_schemaVersion', '_revision', '_gameOverview', '_gameId', 'content', 'gameConfiguration', 'gameId'].includes(key),
            ),
        );
    }
    async write(id: string, entries: CatalogEntry[], revision: number, characterRules?: CharacterRules): Promise<GameSnapshot> {
        entries = normalizeStory(entries);
        const document = await this.document(id);
        const overview = this.overview(id, document);
        const rules: unknown = characterRules ?? document['characterRules'];
        if (rules !== globalThis.undefined && !validCharacterRules(rules)) {throw new ApiError(400, 'Invalid character rules.');}
        const inventoryIssues = inventoryReferenceIssues(rules?.inventory,entries);
        if (inventoryIssues.length) {throw new ApiError(400,inventoryIssues.join(' '));}
        if (rules && validCharacterRules(document['characterRules'])) {
            const issues = characterRulesCompatibility(document['characterRules'], rules);
            if (issues.length) {throw new ApiError(400, issues.join(' '));}
        }
        const farmingSources = validCharacterRules(rules) ? rules.farming?.sources ?? [] : [];
        if (farmingSources.some(source => source.materialIds.some(id => !entries.some(entry => entry.id === id && entry.kind === 'inventory')))) {
            throw new ApiError(400, 'Farming sources must reference materials in this game’s inventory catalog.');
        }
        if (rules && entries.some(entry => entry.characterDefinition && !characterDefinitionFits(entry.characterDefinition, entry.rarity, rules))) {
            throw new ApiError(400, 'Character definitions do not match the game\'s rarity, weapon, damage, or role options. Update the options or definitions together.');
        }
        const invalidProfiles = rules?.progressionProfiles?.some(profile => profile.gameId !== id ||
            profile.tracks.some(track => (track.upgradeCosts ?? []).some(cost =>
                cost.materials.some(material => !entries.some(entry => entry.id === material.itemId && entry.kind === 'inventory')))));
        if (invalidProfiles) {
            throw new ApiError(400, 'Progression profiles must belong to this game and reference its inventory materials.');
        }
        const merged = mergeEntries(document, entries);
        const fields = { ...(document['gameId'] ? { content: { ...document['content'] as Document, ...merged } } : merged), ...(rules ? { characterRules: rules } : {}), _revision: revision + 1 };
        this.checkSize({ ...document, ...fields });
        const result = await this.collection.updateOne(
            { _id: document['_id'] as import('mongodb').ObjectId, _revision: revision },
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
