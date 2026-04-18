/* eslint-disable no-undefined */
import { expect, jest } from "@jest/globals";

import { Event, Version } from "@common/types";
import { DataService } from "./data-service";


// Mocks --------------------------------------------------------------------
process.env["DB_CONN_STRING"] = "mongodb://localhost:27017";
process.env["DB_NAME"] = "test-db";
process.env["DB_COLLECTION"] = "game-guides";

type ObjectId = { _id: string };
type RootDocument = { _id: ObjectId; name: string; events: Array<Event>; [key: string]: unknown };

const mockConnect = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockClose = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDb = { collection: jest.fn() } as unknown as { collection: jest.Mock };
const mockMongoClient = {
    connect: mockConnect,
    close: mockClose,
    db: jest.fn().mockReturnValue(mockDb),
} as unknown as { connect: jest.Mock; close: jest.Mock; db: jest.Mock };

const mockFindOne = jest.fn<() => Promise<RootDocument | null>>();
const mockInsertOne = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockUpdateOne = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

// Mock dotenv to avoid real env loading
jest.mock("dotenv", () => ({ config: jest.fn() }));

jest.mock("mongodb", () => ({
    MongoClient: jest.fn().mockImplementation(() => mockMongoClient),
    ObjectId: jest.fn().mockImplementation(() => ({ _id: "id" })),
}));


describe("DataService", () => {

    let service: DataService;

    beforeEach(() => {
        mockConnect.mockReset().mockResolvedValue(undefined);
        mockClose.mockReset().mockResolvedValue(undefined);
        mockFindOne.mockReset();
        mockInsertOne.mockReset().mockResolvedValue(undefined);
        mockUpdateOne.mockReset().mockResolvedValue(undefined);
        jest.clearAllMocks();

        jest.mocked(mockDb.collection).mockReturnValue({
            findOne: mockFindOne,
            insertOne: mockInsertOne,
            updateOne: mockUpdateOne,
        });
        jest.spyOn(mockMongoClient, "db").mockReturnValue(mockDb);

        service = new DataService();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });


    it("connect/disconnect succeed", async () => {
        expect.hasAssertions();

        await service.connect();
        await service.disconnect();

        expect(mockConnect).toHaveBeenCalledTimes(2);
        expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it("cleanupExpiredItems handles existing doc and updates filtered items", async () => {
        expect.hasAssertions();

        const doc: RootDocument = {
            _id: { _id: "id" },
            name: "Genshin Impact",
            events: [
                { title: "A", endDate: new Date(Date.now() - 86400000).toISOString() } as unknown as Event,
                { title: "B", endDate: new Date(Date.now() + 86400000).toISOString() } as unknown as Event,
            ],
        };
        mockFindOne.mockResolvedValueOnce(doc);

        const filterFn = (item: Event) => new Date(item.endDate as string) >= new Date();
        await service.cleanupExpiredItems("Genshin Impact", "events", filterFn);

        expect(mockFindOne).toHaveBeenCalledWith({ name: "Genshin Impact" });
        expect(mockUpdateOne).toHaveBeenCalledWith(
            { name: "Genshin Impact" },
            { $set: { events: [doc.events[1]] } }
        );
    });

    it("cleanupExpiredItems warns when document missing and does not throw", async () => {
        expect.hasAssertions();

        mockFindOne.mockResolvedValueOnce(null);

        await expect(
            service.cleanupExpiredItems("MissingDoc", "events", () => true)
        ).resolves.toBeUndefined();

        expect(mockUpdateOne).not.toHaveBeenCalled();
    });

    it("addRecords only appends new items and updates collection", async () => {
        expect.hasAssertions();

        const existing: RootDocument = {
            _id: { _id: "id" },
            name: "Genshin Impact",
            events: [{ title: "Existing" } as unknown as Event],
        };

        // getRootDocument path: first findOne returns null -> insertOne -> findOne returns created
        mockFindOne
            .mockResolvedValueOnce(null) // initial root not found
            .mockResolvedValueOnce(existing); // after insert, return existing root

        const records = ([{ title: "Existing" }, { title: "New" }] as unknown) as Array<Event>;
        await service.addRecords("Genshin Impact", "events", records);

        // Insert root when missing
        expect(mockInsertOne).toHaveBeenCalledTimes(1);

        // Update includes both existing + new
        expect(mockUpdateOne).toHaveBeenCalledWith(
            { name: "Genshin Impact" },
            { $set: { events: [{ title: "Existing" }, { title: "New" }] } }
        );
    });

    it("addRecords propagates DB errors gracefully by throwing", async () => {
        expect.hasAssertions();

        mockFindOne
            .mockResolvedValueOnce({ _id: { _id: "id" }, name: "Genshin Impact", events: [] });
        mockUpdateOne.mockRejectedValueOnce(new Error("DB write error"));

        await expect(
            service.addRecords("Genshin Impact", "events", [{ title: "X" }])
        ).rejects.toThrow("DB write error");
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
