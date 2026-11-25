/* eslint-disable no-undefined */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as dotenv from "dotenv";
import { type Document, MongoClient, ObjectId, type UpdateFilter } from "mongodb";

import { EventType } from '@lib/enums';
import type { Event, RootDocument, Version } from '@lib/types';
import { DataService } from "./data-service";
import { Logger } from "./logger";

const { mockConnect, mockClose, mockFindOne, mockInsertOne, mockUpdateOne, mockCollection, mockDb, mockMongoClient } = vi.hoisted(() => {
    const mockConnect = vi.fn<() => Promise<void>>();
    const mockClose = vi.fn<() => Promise<void>>();
    const mockFindOne = vi.fn<(filter: { name: string } | { _gameId: string }) => Promise<RootDocument | null>>();
    const mockInsertOne = vi.fn<(document: RootDocument) => Promise<void>>();
    const mockUpdateOne = vi.fn<(filter: { name: string } | { _gameId: string }, update: UpdateFilter<Document> | Array<Document>) => Promise<void>>();
    const mockCollection = { findOne: mockFindOne, insertOne: mockInsertOne, updateOne: mockUpdateOne };
    const mockDb = { collection: vi.fn<(name: string) => typeof mockCollection>() };
    const mockMongoClient = { connect: mockConnect, close: mockClose, db: vi.fn<(name?: string) => typeof mockDb>() };
    return { mockConnect, mockClose, mockFindOne, mockInsertOne, mockUpdateOne, mockCollection, mockDb, mockMongoClient };
});

vi.mock("dotenv", () => ({ config: vi.fn() }));
vi.mock("mongodb", () => ({
    MongoClient: vi.fn(class {
        connect = mockConnect;
        close = mockClose;
        db = mockMongoClient.db;
    }),
    ObjectId: vi.fn(class {
        toHexString (): string { return "test-id"; }
    }),
}));
vi.mock("./logger", () => ({
    Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const documentName = "Genshin Impact";
const version: Version = { title: "5.6", releaseDate: "2026-02-01", url: "https://example.com/5.6" };

/** Checks that appends preserve live database records and reject concurrent duplicate titles. */
function expectAppend (topic: string, records: Array<Record<string, unknown>>): void {
    const identity = (variable: string) => topic === 'events' ? [
        { $ifNull: [`${variable}.title`, `${variable}.name`] },
        ...['startDate', 'endDate'].map(field => ({ $convert: { input: `${variable}.${field}`, to: 'date', onError: null, onNull: null } })),
    ] : `${variable}.title`;
    expect(mockUpdateOne).toHaveBeenCalledWith({ name: documentName }, [{
        $set: {
            [topic]: {
                $concatArrays: [
                    { $ifNull: [`$${topic}`, []] },
                    {
                        $filter: {
                            input: { $literal: records },
                            as: "record",
                            cond: {
                                $not: [{
                                    $in: [identity('$$record'), {
                                        $map: {
                                            input: { $ifNull: [`$${topic}`, []] }, as: "existing", in: identity('$$existing'),
                                        }
                                    }]
                                }]
                            },
                        }
                    },
                ]
            },
            _revision: { $add: [{ $ifNull: ["$_revision", 0] }, 1] },
        }
    }]);
}

/** Creates a complete event fixture with deterministic dates. */
function createEvent (title: string, endDate = "2026-02-01T00:00:00Z"): Event {
    return { title, startDate: "2026-01-01T00:00:00Z", endDate, url: `https://example.com/${title}`, eventType: EventType.Temporary };
}

/** Creates a root fixture using the shared production type. */
function createRoot (fields: Record<string, unknown> = {}): RootDocument {
    return { _id: new ObjectId(), name: documentName, ...fields };
}

describe("DataService manages database connections and stored game data", () => {
    let service: DataService;
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(async () => {
        originalEnv = { ...process.env };
        process.env["DB_CONN_STRING"] = "mongodb://localhost:27017";
        process.env["DB_NAME"] = "test-db";
        process.env["DB_COLLECTION"] = "game-guides";
        vi.clearAllMocks();
        mockConnect.mockReset().mockResolvedValue(undefined);
        mockClose.mockReset().mockResolvedValue(undefined);
        mockFindOne.mockReset().mockResolvedValue(null);
        mockInsertOne.mockReset().mockResolvedValue(undefined);
        mockUpdateOne.mockReset().mockResolvedValue(undefined);
        mockDb.collection.mockReset().mockReturnValue(mockCollection);
        mockMongoClient.db.mockReset().mockReturnValue(mockDb);
        service = new DataService();
        // Let the constructor's automatic connection finish before exercising methods.
        await Promise.resolve();
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.restoreAllMocks();
    });

    it.each([['fgo', 'Fate Grand Order'], ['gf2', 'Girls Frontline 2']])('updates the registered %s document rather than creating a second name-based document', async (id, parserName) => {
        const bound = new DataService(id);
        mockFindOne.mockResolvedValue(createRoot({ name: 'game:' + id, _gameId: id, events: [] }));
        await bound.addRecords(parserName, 'events', [createEvent('Daily task')]);
        await bound.updateVersion(parserName, version);
        expect(mockFindOne).toHaveBeenCalledWith({ _gameId: id });
        expect(mockFindOne).not.toHaveBeenCalledWith({ name: parserName });
        expect(mockUpdateOne).toHaveBeenCalledWith({ _gameId: id }, expect.any(Array));
        expect(mockUpdateOne).toHaveBeenCalledWith({ _gameId: id }, { $set: { version }, $inc: { _revision: 1 } });
        expect(mockInsertOne).not.toHaveBeenCalled();
    });

    it('refuses to create an invisible duplicate if a bound game is not registered', async () => {
        const bound = new DataService('fgo');
        await expect(bound.addRecords('Fate Grand Order', 'events', [createEvent('Daily task')])).rejects.toThrow('not registered');
        expect(mockInsertOne).not.toHaveBeenCalled();
        expect(mockUpdateOne).not.toHaveBeenCalled();
    });

    describe("Database connections use configured settings and handle lifecycle failures", () => {
        it("loads configuration without starting a connection", () => {
            expect(dotenv.config).toHaveBeenCalledTimes(1);
            expect(MongoClient).toHaveBeenCalledWith("mongodb://localhost:27017");
            expect(mockMongoClient.db).toHaveBeenCalledWith("test-db");
            expect(mockConnect).not.toHaveBeenCalled();
        });

        it("supports explicitly connecting and disconnecting", async () => {
            expect.hasAssertions();
            await expect(service.connect()).resolves.toBeUndefined();
            await expect(service.disconnect()).resolves.toBeUndefined();
            expect(mockConnect).toHaveBeenCalledTimes(1);
            expect(mockClose).toHaveBeenCalledTimes(1);
        });

        it.each([
            { method: "connect" as const, operation: mockConnect },
            { method: "disconnect" as const, operation: mockClose },
        ])("propagates $method failures", async ({ method, operation }) => {
            expect.hasAssertions();
            const error = new Error("Connection failure");
            operation.mockRejectedValueOnce(error);
            await expect(service[method]()).rejects.toBe(error);
            expect(Logger.error).toHaveBeenCalledWith(expect.any(String), error);
        });


    });

    describe("Expired events are removed while retained events are preserved", () => {
        it("removes expired events, preserves order, and evaluates each event once", async () => {
            expect.hasAssertions();
            const expired = { ...createEvent("Expired", "2026-01-15T00:00:00Z"), eventType: EventType.Weekly };
            const active = { ...createEvent("Active"), eventType: EventType.Daily };
            const later = { ...createEvent("Later", "2026-03-01T00:00:00Z"), eventType: EventType.Monthly };
            const events = [active, expired, later];
            mockFindOne.mockResolvedValueOnce(createRoot({ events }));
            const cutoff = new Date("2026-01-20T00:00:00Z");
            const predicate = vi.fn((event: Event) => new Date(event.endDate as string) >= cutoff);
            await service.cleanupExpiredItems(documentName, "events", predicate);
            expect(mockDb.collection).toHaveBeenCalledWith("game-guides");
            expect(mockFindOne).toHaveBeenCalledWith({ name: documentName });
            expect(mockUpdateOne).toHaveBeenCalledTimes(1);
            expect(mockUpdateOne).toHaveBeenCalledWith({ name: documentName }, {
                $pull: { events: { kind: { $exists: false }, $or: [expect.objectContaining({ title: "Expired", eventType: EventType.Weekly }) as unknown] } }, $inc: { _revision: 1 },
            });
            expect(predicate).toHaveBeenCalledTimes(3);
            expect(events).toStrictEqual([active, expired, later]);
            expect(Logger.info).toHaveBeenCalledWith("Removed event: Expired");
        });

        it("removes all expired titles atomically", async () => {
            expect.hasAssertions();
            mockFindOne.mockResolvedValueOnce(createRoot({ events: [{ ...createEvent("Expired"), eventType: EventType.Weekly }] }));
            await service.cleanupExpiredItems(documentName, "events", () => false);
            expect(mockUpdateOne).toHaveBeenCalledWith({ name: documentName }, {
                $pull: { events: { kind: { $exists: false }, $or: [expect.objectContaining({ title: "Expired", eventType: EventType.Weekly }) as unknown] } }, $inc: { _revision: 1 },
            });
        });

        it.each([
            ["all events retained", { events: [createEvent("Active")] }],
            ["empty topic", { events: [] }],
            ["missing topic", {}],
            ["null topic", { events: null }],
        ])("skips writes for %s", async (_label, fields) => {
            expect.hasAssertions();
            mockFindOne.mockResolvedValueOnce(createRoot(fields));
            await expect(service.cleanupExpiredItems(documentName, "events", () => true)).resolves.toBeUndefined();
            expect(mockUpdateOne).not.toHaveBeenCalled();
        });

    });

    it('retains expired non-repeating events and only removes the expired repeating period', async () => {
        const historical = createEvent('Same title');
        const expired = { ...historical, eventType: EventType.Monthly };
        const renewed = { ...expired, startDate: '2026-02-01', endDate: '2026-03-01' };
        mockFindOne.mockResolvedValueOnce(createRoot({ events: [historical, expired, renewed] }));
        await service.cleanupExpiredItems(documentName, 'events', event => event === renewed);
        expect(mockUpdateOne).toHaveBeenCalledWith({ name: documentName }, {
            $pull: { events: { kind: { $exists: false }, $or: [{ title: expired.title, eventType: EventType.Monthly, startDate: expired.startDate, endDate: expired.endDate }] } },
            $inc: { _revision: 1 },
        });
    });

    it.each([EventType.Temporary, EventType.Banner, EventType.Web, EventType.Permanent, EventType.BattlePass, EventType.TCG])('retains %s event history even if the expiration predicate rejects it', async eventType => {
        mockFindOne.mockResolvedValueOnce(createRoot({ events: [{ ...createEvent('History'), eventType }] }));
        await service.cleanupExpiredItems(documentName, 'events', () => false);
        expect(mockUpdateOne).not.toHaveBeenCalled();
    });

    describe("New records are added by title while existing records are preserved", () => {
        it('imports later event periods while retaining history and deduplicating equivalent date formats', async () => {
            expect.hasAssertions();
            const old = createEvent('Festival', '2026-02-01T00:00:00Z');
            const next = { ...old, startDate: '2026-02-01', endDate: '2026-03-01' };
            mockFindOne.mockResolvedValueOnce(createRoot({ events: [old] }));
            await service.addRecords(documentName, 'events', [
                { ...old, startDate: new Date(old.startDate!), endDate: new Date(old.endDate!) }, next, next,
            ]);
            expectAppend('events', [next]);
        });

        it('recognizes a canonical event name and period without creating a second parser record', async () => {
            expect.hasAssertions();
            const source = createEvent('Festival');
            mockFindOne.mockResolvedValueOnce(createRoot({ events: [{ kind: 'events', id: 'shared-event', name: source.title, startDate: source.startDate, endDate: source.endDate }] }));
            await service.addRecords(documentName, 'events', [source]);
            expect(mockUpdateOne).not.toHaveBeenCalled();
        });
        it("preserves existing records and appends only unseen titles in input order", async () => {
            expect.hasAssertions();
            const existing = { title: "Existing", value: 1 };
            const first = { title: "First", value: 2 };
            const second = { title: "Second", value: 3 };
            const stored = [existing];
            const incoming = [{ title: "Existing", value: 99 }, first, second];
            mockFindOne.mockResolvedValueOnce(createRoot({ records: stored, events: [createEvent("Other")] }));
            await service.addRecords(documentName, "records", incoming);
            expect(mockFindOne).toHaveBeenCalledWith({ name: documentName });
            expect(mockInsertOne).not.toHaveBeenCalled();
            expect(mockUpdateOne).toHaveBeenCalledTimes(1);
            expectAppend("records", [first, second]);
            expect(stored).toStrictEqual([existing]);
            expect(incoming).toStrictEqual([{ title: "Existing", value: 99 }, first, second]);
        });

        it("keeps the first record for repeated new titles within a batch", async () => {
            expect.hasAssertions();
            const first = { title: "New", value: 1 };
            mockFindOne.mockResolvedValueOnce(createRoot({ records: [] }));
            await service.addRecords(documentName, "records", [first, { title: "New", value: 2 }]);
            expectAppend("records", [first]);
        });

        it("creates a missing root with an empty topic before storing records", async () => {
            expect.hasAssertions();
            const records = [{ title: "New" }];
            await service.addRecords(documentName, "records", records);
            expect(mockFindOne).toHaveBeenCalledTimes(1);
            expect(mockInsertOne).toHaveBeenCalledTimes(1);
            expect(mockInsertOne).toHaveBeenCalledWith(expect.objectContaining({
                _id: expect.any(Object) as unknown, name: documentName, records: [], events: [], story: [], _schemaVersion: 2, _revision: 0,
            }));
            expectAppend("records", records);
        });

        it("initializes a missing topic without replacing unrelated fields", async () => {
            expect.hasAssertions();
            const root = createRoot({ version });
            mockFindOne.mockResolvedValueOnce(root);
            await service.addRecords(documentName, "records", [{ title: "New" }]);
            expect(mockInsertOne).not.toHaveBeenCalled();
            expectAppend("records", [{ title: "New" }]);
            expect(root["version"]).toStrictEqual(version);
        });

        it.each([
            ["empty input", []],
            ["existing titles only", [{ title: "Existing" }]],
        ])("preserves stored records for %s", async (_label, records) => {
            expect.hasAssertions();
            const existing = { title: "Existing", value: 1 };
            mockFindOne.mockResolvedValueOnce(createRoot({ records: [existing] }));
            await service.addRecords(documentName, "records", records);
            expect(mockUpdateOne).not.toHaveBeenCalled();
        });
    });

    describe("Version information is stored when a new version title is detected", () => {
        it.each([
            ["changed version", { version: { ...version, title: "5.5" }, events: [] }],
            ["missing version", { events: [] }],
        ])("stores the supplied version and returns true for %s", async (_label, fields) => {
            expect.hasAssertions();
            mockFindOne.mockResolvedValueOnce(createRoot(fields));
            await expect(service.updateVersion(documentName, version)).resolves.toBe(true);
            expect(mockInsertOne).not.toHaveBeenCalled();
            expect(mockUpdateOne).toHaveBeenCalledTimes(1);
            expect(mockUpdateOne).toHaveBeenCalledWith({ name: documentName }, { $set: { version }, $inc: { _revision: 1 } });
        });

        it("creates a missing root and stores the first version", async () => {
            expect.hasAssertions();
            let insertedDocument: RootDocument | undefined;
            mockInsertOne.mockImplementationOnce(async (document) => {
                insertedDocument = { ...document };
                await Promise.resolve();
            });
            await expect(service.updateVersion(documentName, version)).resolves.toBe(true);
            expect(mockFindOne).toHaveBeenCalledTimes(1);
            expect(mockInsertOne).toHaveBeenCalledTimes(1);
            expect(insertedDocument).toStrictEqual(expect.objectContaining({
                _id: expect.any(Object) as unknown,
                name: documentName,
                version: { title: "", releaseDate: "", url: "" },
                events: [],
                story: [],
                _schemaVersion: 2,
                _revision: 0,
            }));
            expect(mockUpdateOne).toHaveBeenCalledWith({ name: documentName }, { $set: { version }, $inc: { _revision: 1 } });
        });

        it("skips writes when the version title is unchanged", async () => {
            expect.hasAssertions();
            mockFindOne.mockResolvedValueOnce(createRoot({ version }));
            await expect(service.updateVersion(documentName, version)).resolves.toBe(false);
            expect(mockUpdateOne).not.toHaveBeenCalled();
        });

        it("updates corrected metadata without treating it as a new version", async () => {
            const corrected = { ...version, url: "https://example.com/changed" };
            mockFindOne.mockResolvedValueOnce(createRoot({ version }));
            await expect(service.updateVersion(documentName, corrected)).resolves.toBe(false);
            expect(mockUpdateOne).toHaveBeenCalledWith({ name: documentName }, {
                $set: { version: corrected }, $inc: { _revision: 1 },
            });
        });
    });

    describe("Database failures are logged and propagated to callers", () => {
        const operations = [
            { name: "cleanupExpiredItems", run: async () => service.cleanupExpiredItems(documentName, "events", () => false) },
            { name: "addRecords", run: async () => service.addRecords(documentName, "events", [createEvent("New")]) },
            { name: "updateVersion", run: async () => service.updateVersion(documentName, version) },
        ];

        it.each(operations)("$name propagates lookup errors without writing", async ({ run }) => {
            expect.hasAssertions();
            const error = new Error("Lookup failed");
            mockFindOne.mockRejectedValueOnce(error);
            await expect(run()).rejects.toBe(error);
            expect(mockInsertOne).not.toHaveBeenCalled();
            expect(mockUpdateOne).not.toHaveBeenCalled();
            expect(Logger.error).toHaveBeenCalledWith(expect.any(String), error);
        });

        it.each(operations.slice(1))("$name propagates insertion errors without updating", async ({ run }) => {
            expect.hasAssertions();
            const error = new Error("Insert failed");
            mockInsertOne.mockRejectedValueOnce(error);
            await expect(run()).rejects.toBe(error);
            expect(mockUpdateOne).not.toHaveBeenCalled();
            expect(Logger.error).toHaveBeenCalledWith(expect.any(String), error);
        });

        it.each(operations)("$name propagates update errors", async ({ run }) => {
            expect.hasAssertions();
            const error = new Error("Update failed");
            mockFindOne.mockResolvedValueOnce(createRoot({ events: [{ ...createEvent("Expired"), eventType: EventType.Weekly }] }));
            mockUpdateOne.mockRejectedValueOnce(error);
            await expect(run()).rejects.toBe(error);
            expect(Logger.error).toHaveBeenCalledWith(expect.any(String), error);
        });
    });

    it("strips player state and deduplicates incoming parser records", async () => {
        expect.hasAssertions();
        mockFindOne.mockResolvedValueOnce(createRoot({ events: [] }));
        await service.addRecords(documentName, "events", [
            { title: "New", completed: false, quantity: 5, target: 10 },
            { title: "New", completed: true, quantity: 6, target: 20 },
        ]);
        expectAppend("events", [{ title: "New" }]);
    });

    it('appends into nested game content without writing legacy top-level arrays', async () => {
        mockFindOne.mockResolvedValueOnce(createRoot({ gameId: 'genshin', content: { events: [createEvent('Existing')] } }));
        await service.addRecords(documentName, 'events', [createEvent('Existing'), createEvent('New')]);
        const update = mockUpdateOne.mock.calls[0][1] as Document[];
        expect(update[0]['$set']).toHaveProperty('content.events');
        expect(update[0]['$set']).not.toHaveProperty('events');
        expect(JSON.stringify(update)).toContain('$content.events');
        expect(JSON.stringify(update)).not.toContain('$events');
    });

    it('cleans recurring events from nested content without touching limited-time history', async () => {
        mockFindOne.mockResolvedValueOnce(createRoot({ content: { events: [{ ...createEvent('Daily'), eventType: EventType.Daily }, createEvent('History')] } }));
        await service.cleanupExpiredItems(documentName, 'events', () => false);
        expect(mockUpdateOne.mock.calls[0][1]).toMatchObject({ $pull: { 'content.events': { $or: [{ title: 'Daily' }] } } });
    });

    it("removes expired parser events while preserving manually authored events", async () => {
        expect.hasAssertions();
        mockFindOne.mockResolvedValueOnce(createRoot({
            events: [{ ...createEvent("Expired"), eventType: EventType.Weekly }, { kind: "events", name: "Manual", title: "Expired" }],
        }));
        const filter = vi.fn(() => false);
        await service.cleanupExpiredItems(documentName, "events", filter);
        expect(filter).toHaveBeenCalledTimes(1);
        expect(mockUpdateOne).toHaveBeenCalledWith(
            { name: documentName },
            { $pull: { events: { kind: { $exists: false }, $or: [expect.objectContaining({ title: "Expired", eventType: EventType.Weekly }) as unknown] } }, $inc: { _revision: 1 } },
        );
    });
});
