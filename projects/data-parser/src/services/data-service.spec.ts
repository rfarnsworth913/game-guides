/* eslint-disable no-undefined */
import { expect, jest } from "@jest/globals";
import * as dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

import { EventType } from "@common/enums";
import { Event, RootDocument, Version } from "@common/types";
import { DataService } from "./data-service";
import { Logger } from "./logger";

const mockConnect = jest.fn<() => Promise<void>>();
const mockClose = jest.fn<() => Promise<void>>();
const mockFindOne = jest.fn<(filter: { name: string }) => Promise<RootDocument | null>>();
const mockInsertOne = jest.fn<(document: RootDocument) => Promise<void>>();
const mockUpdateOne = jest.fn<(filter: { name: string }, update: { $set: Record<string, unknown> }) => Promise<void>>();
const mockCollection = { findOne: mockFindOne, insertOne: mockInsertOne, updateOne: mockUpdateOne };
const mockDb = { collection: jest.fn<(name: string) => typeof mockCollection>() };
const mockMongoClient = {
    connect: mockConnect,
    close: mockClose,
    db: jest.fn<(name?: string) => typeof mockDb>(),
};

jest.mock("dotenv", () => ({ config: jest.fn() }));
jest.mock("mongodb", () => ({
    MongoClient: jest.fn().mockImplementation(() => mockMongoClient),
    ObjectId: jest.fn().mockImplementation(() => ({ toHexString: () => "test-id" })),
}));
jest.mock("./logger", () => ({
    Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const documentName = "Genshin Impact";
const version: Version = { title: "5.6", releaseDate: "2026-02-01", url: "https://example.com/5.6" };

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
        jest.clearAllMocks();
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
        jest.restoreAllMocks();
    });

    describe("Database connections use configured settings and handle lifecycle failures", () => {
        it("loads configuration and connects automatically", () => {
            expect(dotenv.config).toHaveBeenCalledTimes(1);
            expect(MongoClient).toHaveBeenCalledWith("mongodb://localhost:27017");
            expect(mockMongoClient.db).toHaveBeenCalledWith("test-db");
            expect(mockConnect).toHaveBeenCalledTimes(1);
        });

        it("supports explicitly connecting and disconnecting", async () => {
            expect.hasAssertions();
            await expect(service.connect()).resolves.toBeUndefined();
            await expect(service.disconnect()).resolves.toBeUndefined();
            expect(mockConnect).toHaveBeenCalledTimes(2);
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

        it("handles and logs automatic connection failure", async () => {
            expect.hasAssertions();
            const error = new Error("Unavailable database");
            mockConnect.mockRejectedValueOnce(error);
            new DataService();
            // Drain both connect's rejection and the constructor's catch callback.
            await Promise.resolve();
            await Promise.resolve();
            expect(Logger.error).toHaveBeenCalledWith("Failed to connect to the database:", error);
        });
    });

    describe("Expired events are removed while retained events are preserved", () => {
        it("removes expired events, preserves order, and evaluates each event once", async () => {
            expect.hasAssertions();
            const expired = createEvent("Expired", "2026-01-15T00:00:00Z");
            const active = createEvent("Active");
            const later = createEvent("Later", "2026-03-01T00:00:00Z");
            const events = [active, expired, later];
            mockFindOne.mockResolvedValueOnce(createRoot({ events }));
            const cutoff = new Date("2026-01-20T00:00:00Z");
            const predicate = jest.fn((event: Event) => new Date(event.endDate as string) >= cutoff);
            await service.cleanupExpiredItems(documentName, "events", predicate);
            expect(mockDb.collection).toHaveBeenCalledWith("game-guides");
            expect(mockFindOne).toHaveBeenCalledWith({ name: documentName });
            expect(mockUpdateOne).toHaveBeenCalledTimes(1);
            expect(mockUpdateOne).toHaveBeenCalledWith({ name: documentName }, { $set: { events: [active, later] } });
            expect(predicate).toHaveBeenCalledTimes(3);
            expect(events).toStrictEqual([active, expired, later]);
            expect(Logger.info).toHaveBeenCalledWith("Removed event: Expired");
        });

        it("persists an empty array when all events are removed", async () => {
            expect.hasAssertions();
            mockFindOne.mockResolvedValueOnce(createRoot({ events: [createEvent("Expired")] }));
            await service.cleanupExpiredItems(documentName, "events", () => false);
            expect(mockUpdateOne).toHaveBeenCalledWith({ name: documentName }, { $set: { events: [] } });
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

        expect(mockFindOne).toHaveBeenCalledWith({ name: "Genshin Impact" });
        expect(mockUpdateOne).toHaveBeenCalledWith(
            { name: "Genshin Impact" },
            { $pull: { events: { title: { $in: ["A"] }, kind: { $exists: false } } }, $inc: { _revision: 1 } }
        );
    });

    describe("New records are added by title while existing records are preserved", () => {
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
            expect(mockUpdateOne).toHaveBeenCalledWith({ name: documentName }, { $set: { records: [existing, first, second] } });
            expect(stored).toStrictEqual([existing]);
            expect(incoming).toStrictEqual([{ title: "Existing", value: 99 }, first, second]);
        });

        it("keeps the first record for repeated new titles within a batch", async () => {
            expect.hasAssertions();
            const first = { title: "New", value: 1 };
            mockFindOne.mockResolvedValueOnce(createRoot({ records: [] }));
            await service.addRecords(documentName, "records", [first, { title: "New", value: 2 }]);
            expect(mockUpdateOne).toHaveBeenCalledWith({ name: documentName }, { $set: { records: [first] } });
        });

        it("creates a missing root with an empty topic before storing records", async () => {
            expect.hasAssertions();
            const records = [{ title: "New" }];
            await service.addRecords(documentName, "records", records);
            expect(mockFindOne).toHaveBeenCalledTimes(1);
            expect(mockInsertOne).toHaveBeenCalledTimes(1);
            expect(mockInsertOne).toHaveBeenCalledWith({ _id: expect.any(Object), name: documentName, records: [] });
            expect(mockUpdateOne).toHaveBeenCalledWith({ name: documentName }, { $set: { records } });
        });

        it("initializes a missing topic without replacing unrelated fields", async () => {
            expect.hasAssertions();
            const root = createRoot({ version });
            mockFindOne.mockResolvedValueOnce(root);
            await service.addRecords(documentName, "records", [{ title: "New" }]);
            expect(mockInsertOne).not.toHaveBeenCalled();
            expect(mockUpdateOne).toHaveBeenCalledWith({ name: documentName }, { $set: { records: [{ title: "New" }] } });
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
            expect(mockUpdateOne).toHaveBeenCalledWith({ name: documentName }, { $set: { records: [existing] } });
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
            expect(mockUpdateOne).toHaveBeenCalledWith({ name: documentName }, { $set: { version } });
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
            expect(insertedDocument).toStrictEqual({ _id: expect.any(Object), name: documentName });
            expect(mockUpdateOne).toHaveBeenCalledWith({ name: documentName }, { $set: { version } });
        });

        // getRootDocument path: first findOne returns null -> insertOne -> findOne returns created
        mockFindOne
            .mockResolvedValueOnce(null) // initial root not found
            .mockResolvedValueOnce(existing); // after insert, return existing root

        const records = ([{ title: "Existing" }, { title: "New" }] as unknown) as Array<Event>;
        await service.addRecords("Genshin Impact", "events", records);

        // Insert root when missing
        expect(mockInsertOne).toHaveBeenCalledTimes(1);

        // Appends with an atomic pipeline rather than replacing a stale snapshot
        expect(mockUpdateOne).toHaveBeenCalledWith(
            { name: "Genshin Impact" },
            expect.any(Array)
        );
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

    it("strips player state and deduplicates incoming parser records", async () => {
        expect.hasAssertions();
        mockFindOne.mockResolvedValueOnce({ _id: { _id: "id" }, name: "Genshin Impact", events: [] });
        await service.addRecords("Genshin Impact", "events", [
            { title: "New", completed: false, quantity: 5, target: 10 },
            { title: "New", completed: true, quantity: 6, target: 20 },
        ]);
        const write = JSON.stringify(mockUpdateOne.mock.calls);
        expect(write).not.toContain('"completed"');
        expect(write).not.toContain('"quantity"');
        expect(write).not.toContain('"target"');
        expect(write.match(/"title":"New"/g)).toHaveLength(1);
        expect(write).toContain('"_revision"');
    });

    it("can remove every expired parser event while preserving manually authored events", async () => {
        expect.hasAssertions();
        mockFindOne.mockResolvedValueOnce({
            _id: { _id: "id" }, name: "Genshin Impact",
            events: [{ title: "Expired" }, { kind: "events", name: "Manual" }] as unknown as Array<Event>,
        });
        const filter = jest.fn(() => false);
        await service.cleanupExpiredItems("Genshin Impact", "events", filter);
        expect(filter).toHaveBeenCalledTimes(1);
        expect(mockUpdateOne).toHaveBeenCalledWith(
            { name: "Genshin Impact" },
            { $pull: { events: { title: { $in: ["Expired"] }, kind: { $exists: false } } }, $inc: { _revision: 1 } },
        );
    });

    it("updateVersion returns true and updates when version changed", async () => {
        expect.hasAssertions();

        const existing: RootDocument = {
            _id: { _id: "id" },
            name: "Genshin Impact",
            events: [],
            version: {
                title: "5.5: Day of the Flame's Return",
                releaseDate: "2026-01-01",
                url: "https://example.com/v5-5"
            }
        };

        mockFindOne.mockResolvedValueOnce(existing);

        const nextVersion: Version = {
            title: "5.6: Paralogism",
            releaseDate: "2026-02-01",
            url: "https://example.com/v5-6"
        };

        const isNewVersion = await service.updateVersion("Genshin Impact", nextVersion);

        expect(isNewVersion).toBe(true);
        expect(mockUpdateOne).toHaveBeenCalledWith(
            { name: "Genshin Impact" },
            { $set: { version: nextVersion } }
        );
    });

    it("updateVersion returns false and skips update when version unchanged", async () => {
        expect.hasAssertions();

        const currentVersion: Version = {
            title: "5.6: Paralogism",
            releaseDate: "2026-02-01",
            url: "https://example.com/v5-6"
        };

        const existing: RootDocument = {
            _id: { _id: "id" },
            name: "Genshin Impact",
            events: [],
            version: currentVersion
        };

        mockFindOne.mockResolvedValue(existing);

        const isNewVersion = await service.updateVersion("Genshin Impact", currentVersion);

        expect(isNewVersion).toBe(false);
        expect(mockUpdateOne).not.toHaveBeenCalled();
    });
});
