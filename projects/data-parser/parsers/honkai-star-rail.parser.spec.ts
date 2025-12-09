import { expect, jest } from "@jest/globals";
import * as puppeteer from "puppeteer";

import { DataFile, DataSource, HonkaiStarRailEvent } from "../lib/types";
import { DataService } from "../services";
import { HonkaiStarRailParser } from "./honkai-star-rail.parser";


// Mock Test Dependencies -----------------------------------------------------
jest.mock("../services");
jest.mock("puppeteer");


describe("Honkai Star Rail Parser", () => {

    // Configurable Test Variables --------------------------------------------
    let parser: HonkaiStarRailParser;
    let mockDataService: jest.Mocked<DataService>;
    let mockBrowser: jest.Mocked<puppeteer.Browser>;
    let mockPage: jest.Mocked<puppeteer.Page>;


    const mockDataFile: DataFile = {
        id: "Honkai Star Rail",
        sourceList: [
            { id: "Events", url: "https://example.com/hsr/events" },
            { id: "Anomaly Arbitration", url: "https://example.com/hsr/anomaly" },
        ]
    };


    // Test Setup -------------------------------------------------------------
    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Setup DataService mock
        mockDataService = {
            cleanupExpiredItems: jest.fn(),
            addRecords: jest.fn(),
            disconnect: jest.fn()
        } as unknown as jest.Mocked<DataService>;

        // Setup Puppeteer mocks
        mockPage = {
            setViewport: jest.fn(),
            goto: jest.fn(),
            $$eval: jest.fn(),
            $eval: jest.fn()
        } as unknown as jest.Mocked<puppeteer.Page>;

        // Explicitly type the newPage mock to avoid 'never' inference
        const mockNewPage = jest.fn<() => Promise<puppeteer.Page>>()
            .mockResolvedValue(mockPage as unknown as puppeteer.Page);

        mockBrowser = {
            newPage: mockNewPage,
            close: jest.fn()
        } as unknown as jest.Mocked<puppeteer.Browser>;

        jest.mocked(puppeteer.launch).mockResolvedValue(mockBrowser);

        // Create parser instance with mocked DataService
        parser = new HonkaiStarRailParser(mockDataFile, mockDataService);
    });

    describe("parseData", () => {
        it("parses all sources and disconnects", async() => {
            expect.hasAssertions();

            // Events -> returns empty
            mockPage.$$eval.mockResolvedValueOnce([]);
            // Treasures Lightward -> returns one row (unformatted dates)
            const tlRow: HonkaiStarRailEvent = {
                title: "",
                url: "",
                banner: "",
                startDate: "2025-11-01T12:00:00.000Z",
                endDate: "2025-11-15T12:00:00.000Z",
                eventType: "end-game",
                completed: false
            };
            mockPage.$$eval.mockResolvedValueOnce([tlRow]);

            await parser.parseData();

            expect(mockDataService.cleanupExpiredItems).toHaveBeenCalledTimes(1);
            expect(mockDataService.addRecords).toHaveBeenCalledTimes(2);
            expect(mockDataService.disconnect).toHaveBeenCalledTimes(1);
        });

        it("throws when no data provided", async() => {
            expect.hasAssertions();

            const emptyParser = new HonkaiStarRailParser({ id: "hsr", sourceList: [] }, mockDataService);
            await expect(emptyParser.parseData()).rejects.toThrow("No data provided for parsing.");
            expect(mockDataService.disconnect).not.toHaveBeenCalled();
        });

        it("handles unknown source IDs gracefully", async() => {
            expect.hasAssertions();

            const df: DataFile = { id: "hsr", sourceList: [{ id: "Unknown", url: "https://example.com" }] };
            const p = new HonkaiStarRailParser(df, mockDataService);
            await p.parseData();
            expect(mockDataService.disconnect).toHaveBeenCalledTimes(1);
        });
    });

    describe("parseEvents", () => {
        it("adds parsed events to DB", async() => {
            expect.hasAssertions();

            const events: Array<HonkaiStarRailEvent> = [
                { title: "Test", url: "https://x", banner: "b.png", startDate: "Nov 1, 2025", endDate: "Nov 3, 2025", eventType: "temporary", completed: false }
            ];
            mockPage.$$eval.mockResolvedValue(events);

            const source: DataSource = { id: "Events", url: "https://example.com/hsr/events" };
            await parser["parseEvents"](source);

            expect(mockDataService.addRecords).toHaveBeenCalledWith(
                "Honkai Star Rail",
                "events",
                events
            );
            expect(jest.mocked(puppeteer.launch)).toHaveBeenCalledWith({ headless: false });
            expect(mockBrowser.close).toHaveBeenCalled();
        });

        it("handles empty table gracefully", async() => {
            expect.hasAssertions();
            mockPage.$$eval.mockResolvedValue([]);
            const source: DataSource = { id: "Events", url: "https://example.com/hsr/events" };
            await parser["parseEvents"](source);
            expect(mockDataService.addRecords).toHaveBeenCalledWith("Honkai Star Rail", "events", []);
        });

        it("handles parsing errors gracefully", async() => {
            expect.hasAssertions();
            mockPage.$$eval.mockRejectedValue(new Error("Selector not found"));
            const source: DataSource = { id: "Events", url: "https://example.com/hsr/events" };
            await parser["parseEvents"](source);
            expect(mockDataService.addRecords).toHaveBeenCalledWith("Honkai Star Rail", "events", []);
            expect(mockBrowser.close).toHaveBeenCalled();
        });
    });

    describe("parseTreasuresLightward", () => {
        it("extracts last History row, formats, and stores", async() => {
            expect.hasAssertions();

            // First $$eval for Events won't be used here; we directly call TL
            const tlRow: HonkaiStarRailEvent = {
                title: "",
                url: "",
                banner: "",
                startDate: "2025-11-01",
                endDate: "2025-11-15",
                eventType: "end-game",
                completed: false
            };
            mockPage.$$eval.mockResolvedValue([tlRow]);

            const source: DataSource = { id: "Anomaly Arbitration", url: "https://example.com/hsr/anomaly", banner: "banner.png" };
            await parser["parseTreasuresLightward"](source);

            expect(mockDataService.addRecords).toHaveBeenCalledTimes(1);
            const [[doc, subdoc, payload]] = mockDataService.addRecords.mock.calls;
            expect(doc).toBe("Honkai Star Rail");
            expect(subdoc).toBe("events");
            expect(payload).toHaveLength(1);
            expect(payload[0]).toStrictEqual(expect.objectContaining({
                title: "Anomaly Arbitration",
                banner: "banner.png",
                url: "https://example.com/hsr/anomaly",
                startDate: expect.stringMatching(/^\w+ \d{2}, \d{4}$/),
                endDate: expect.stringMatching(/^\w+ \d{2}, \d{4}$/),
                eventType: "end-game",
                completed: false
            }));
        });

        it("handles no rows gracefully (no DB write)", async() => {
            expect.hasAssertions();
            mockPage.$$eval.mockResolvedValue([]);
            const source: DataSource = { id: "Apocalyptic Shadow", url: "https://example.com/hsr/shadow" };
            await parser["parseTreasuresLightward"](source);
            expect(mockDataService.addRecords).not.toHaveBeenCalled();
        });

        it("handles parser errors gracefully (no DB write)", async() => {
            expect.hasAssertions();
            mockPage.$$eval.mockRejectedValue(new Error("boom"));
            const source: DataSource = { id: "Forgotten Hall", url: "https://example.com/hsr/hall" };
            await parser["parseTreasuresLightward"](source);
            expect(mockDataService.addRecords).not.toHaveBeenCalled();
            expect(mockBrowser.close).toHaveBeenCalled();
        });

        it("propagates DB errors from addRecords", async() => {
            expect.hasAssertions();
            const tlRow: HonkaiStarRailEvent = {
                title: "",
                url: "",
                banner: "",
                startDate: "2025-11-01",
                endDate: "2025-11-15",
                eventType: "end-game",
                completed: false
            };
            mockPage.$$eval.mockResolvedValue([tlRow]);
            mockDataService.addRecords.mockRejectedValue(new Error("DB write error"));
            const source: DataSource = { id: "Pure Fiction", url: "https://example.com/hsr/pure" };
            await expect(parser["parseTreasuresLightward"](source)).rejects.toThrow("DB write error");
        });
    });

    describe("cleanupExpiredEvents", () => {
        it("calls cleanupExpiredItems with correct params and predicate", async() => {
            expect.hasAssertions();
            await parser["cleanupExpiredEvents"]();

            expect(mockDataService.cleanupExpiredItems).toHaveBeenCalledWith(
                "Honkai Star Rail",
                "events",
                expect.any(Function)
            );

            const predicate = mockDataService.cleanupExpiredItems.mock.calls[0][2] as (e: HonkaiStarRailEvent) => boolean;
            const future: HonkaiStarRailEvent = { title: "f", url: "", banner: "", startDate: "", endDate: "2999-01-01T00:00:00.000Z", eventType: "temporary", completed: false };
            const past: HonkaiStarRailEvent = { title: "p", url: "", banner: "", startDate: "", endDate: "2000-01-01T00:00:00.000Z", eventType: "temporary", completed: false };
            const perm: HonkaiStarRailEvent = { title: "perm", url: "", banner: "", startDate: "", endDate: "2000-01-01T00:00:00.000Z", eventType: "permanent", completed: false };
            expect(predicate(future)).toBe(true);
            expect(predicate(past)).toBe(false);
            expect(predicate(perm)).toBe(true);
        });

        it("logs and swallows cleanup errors", async() => {
            expect.hasAssertions();
            mockDataService.cleanupExpiredItems.mockRejectedValue(new Error("Database error"));
            await parser["cleanupExpiredEvents"]();
            expect(mockDataService.cleanupExpiredItems).toHaveBeenCalled();
        });
    });

    describe("parserController", () => {
        it("returns data from callback and closes browser", async() => {
            expect.hasAssertions();
            const sample: Array<HonkaiStarRailEvent> = [{ title: "t", url: "u", banner: "b", startDate: "s", endDate: "e", eventType: "temporary", completed: false }];
            const result = await parser["parserController"]("https://x", async() => await Promise.resolve(sample));
            expect(result).toStrictEqual(sample);
            expect(mockPage.goto).toHaveBeenCalledWith("https://x", { waitUntil: "domcontentloaded" });
            expect(mockBrowser.close).toHaveBeenCalled();
        });

        it("catches callback errors and returns empty array", async() => {
            expect.hasAssertions();
            const result = await parser["parserController"]("https://x", async() => { await Promise.resolve(); throw new Error("fail"); });
            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(0);
            expect(mockBrowser.close).toHaveBeenCalled();
        });
    });

});
