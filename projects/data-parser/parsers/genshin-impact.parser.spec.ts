import { expect, jest } from "@jest/globals";
import * as puppeteer from "puppeteer";

import { DataFile, DataSource, GenshinEvent } from "../lib/types";
import { DataService } from "../services";

import { GenshinImpactParser } from "./genshin-impact.parser";


// Mock Test Dependencies -----------------------------------------------------
jest.mock("../services");
jest.mock("puppeteer");


// eslint-disable-next-line max-lines-per-function
describe("Genshin Impact Parser", () => {

    // Configurable Test Variables --------------------------------------------
    let parser: GenshinImpactParser;
    let mockDataService: jest.Mocked<DataService>;
    let mockBrowser: jest.Mocked<puppeteer.Browser>;
    let mockPage: jest.Mocked<puppeteer.Page>;

    const mockDataFile: DataFile = {
        id: "genshin-impact",
        sourceList: [
            { id: "Events", url: "https://example.com/events" },
            { id: "Spiral Abyss", url: "https://example.com/abyss" },
            { id: "Imaginarium Theater", url: "https://example.com/theater" }
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
        parser = new GenshinImpactParser(mockDataFile, mockDataService);
    });

    describe("parseData", () => {

        it("should successfully parse all sources", async() => {
            expect.hasAssertions();

            // Setup mocks for all parsers
            mockPage.$$eval.mockResolvedValue([]);
            mockPage.$eval.mockResolvedValue("(NA) Ends in: 5d 10h 30m 15s");

            await parser.parseData();

            expect(mockDataService.cleanupExpiredItems).toHaveBeenCalledTimes(1);
            expect(mockDataService.addRecords).toHaveBeenCalledTimes(3);
            expect(mockDataService.disconnect).toHaveBeenCalledTimes(1);
        });

        it("should throw error when no data provided", async() => {
            expect.hasAssertions();

            const emptyDataFile: DataFile = { id: "test", sourceList: [] };
            const emptyParser = new GenshinImpactParser(emptyDataFile, mockDataService);

            await expect(emptyParser.parseData()).rejects.toThrow("No data provided for parsing.");
            expect(mockDataService.disconnect).not.toHaveBeenCalled();
        });

        it("should throw error when sourceList is undefined", async() => {
            expect.hasAssertions();

            const invalidDataFile = { id: "test" } as DataFile;
            const invalidParser = new GenshinImpactParser(invalidDataFile, mockDataService);

            await expect(invalidParser.parseData()).rejects.toThrow("No data provided for parsing.");
        });

        it("should handle unknown source IDs gracefully", async() => {
            expect.hasAssertions();

            const dataFileWithUnknown: DataFile = {
                id: "test",
                sourceList: [{ id: "Unknown Source", url: "https://example.com" }]
            };
            const testParser = new GenshinImpactParser(dataFileWithUnknown, mockDataService);

            await testParser.parseData();

            expect(mockDataService.disconnect).toHaveBeenCalledTimes(1);
        });
    });

    describe("parseEvents", () => {
        const mockEventsData = [
            {
                title: "Test Event 1",
                url: "https://example.com/event1",
                banner: "https://example.com/banner1.png",
                startDate: "November 01, 2025",
                endDate: "November 15, 2025",
                eventType: "temporary",
                completed: false
            },
            {
                title: "Permanent Event",
                url: "https://example.com/event2",
                banner: "https://example.com/banner2.png",
                startDate: "November 01, 2025",
                endDate: "Indefinite",
                eventType: "permanent",
                completed: false
            }
        ];

        it("should successfully parse events from table", async() => {
            expect.hasAssertions();

            mockPage.$$eval.mockResolvedValue(mockEventsData);

            const source: DataSource = { id: "Events", url: "https://example.com/events" };
            await parser["parseEvents"](source);

            expect(mockBrowser.newPage).toHaveBeenCalled();
            expect(mockPage.goto).toHaveBeenCalledWith(
                "https://example.com/events",
                { waitUntil: "domcontentloaded" }
            );
            expect(mockDataService.addRecords).toHaveBeenCalledWith(
                "Genshin Impact",
                "events",
                mockEventsData
            );
            expect(mockBrowser.close).toHaveBeenCalled();
        });

        it("should handle empty events table", async() => {
            expect.hasAssertions();

            mockPage.$$eval.mockResolvedValue([]);

            const source: DataSource = { id: "Events", url: "https://example.com/events" };
            await parser["parseEvents"](source);

            expect(mockDataService.addRecords).toHaveBeenCalledWith(
                "Genshin Impact",
                "events",
                []
            );
        });

        it("should handle parsing errors gracefully", async() => {
            expect.hasAssertions();

            mockPage.$$eval.mockRejectedValue(new Error("Selector not found"));

            const source: DataSource = { id: "Events", url: "https://example.com/events" };
            await parser["parseEvents"](source);

            expect(mockDataService.addRecords).toHaveBeenCalledWith(
                "Genshin Impact",
                "events",
                []
            );
            expect(mockBrowser.close).toHaveBeenCalled();
        });
    });

    describe("parseSpiralAbyss", () => {
        it("should successfully parse Spiral Abyss countdown", async() => {
            expect.hasAssertions();

            mockPage.$eval.mockResolvedValue("(NA) Ends in: 5d 10h 30m 15s");

            const source: DataSource = { id: "Spiral Abyss", url: "https://example.com/abyss" };
            await parser["parseSpiralAbyss"](source);

            expect(mockPage.$eval).toHaveBeenCalledWith(
                ".gi-countdown-NA",
                expect.any(Function)
            );
            expect(mockDataService.addRecords).toHaveBeenCalledWith(
                "Genshin Impact",
                "events",
                expect.arrayContaining([
                    expect.objectContaining({
                        title: "Spiral Abyss",
                        eventType: "end-game",
                        completed: false
                    })
                ])
            );
        });

        it("should handle countdown without days", async() => {
            expect.hasAssertions();

            mockPage.$eval.mockResolvedValue("(NA) Ends in: 10h 30m 15s");

            const source: DataSource = { id: "Spiral Abyss", url: "https://example.com/abyss" };
            await parser["parseSpiralAbyss"](source);

            expect(mockDataService.addRecords).toHaveBeenCalledWith(
                "Genshin Impact",
                "events",
                expect.arrayContaining([
                    expect.objectContaining({
                        title: "Spiral Abyss"
                    })
                ])
            );
        });

        it("should handle empty countdown string", async() => {
            expect.hasAssertions();

            mockPage.$eval.mockResolvedValue("");

            const source: DataSource = { id: "Spiral Abyss", url: "https://example.com/abyss" };
            await parser["parseSpiralAbyss"](source);

            expect(mockDataService.addRecords).toHaveBeenCalledWith(
                "Genshin Impact",
                "events",
                expect.arrayContaining([
                    expect.objectContaining({
                        title: "Spiral Abyss"
                    })
                ])
            );
        });

        it("should handle countdown element not found", async() => {
            expect.hasAssertions();

            mockPage.$eval.mockRejectedValue(new Error("Element not found"));

            const source: DataSource = { id: "Spiral Abyss", url: "https://example.com/abyss" };
            await parser["parseSpiralAbyss"](source);

            expect(mockDataService.addRecords).toHaveBeenCalledWith(
                "Genshin Impact",
                "events",
                []
            );
        });
    });

    describe("parseImaginariumTheater", () => {
        it("should successfully parse Imaginarium Theater dates", async() => {
            expect.hasAssertions();

            const mockDates = {
                startDate: "November 01, 2025",
                endDate: "November 30, 2025"
            };
            mockPage.$$eval.mockResolvedValue(mockDates);

            const source: DataSource = { id: "Imaginarium Theater", url: "https://example.com/theater" };
            await parser["parseImaginariumTheater"](source);

            expect(mockPage.$$eval).toHaveBeenCalledWith("h3", expect.any(Function));
            expect(mockDataService.addRecords).toHaveBeenCalledWith(
                "Genshin Impact",
                "events",
                expect.arrayContaining([
                    expect.objectContaining({
                        title: "Imaginarium Theater",
                        startDate: "November 01, 2025",
                        endDate: "November 30, 2025",
                        eventType: "end-game",
                        completed: false
                    })
                ])
            );
        });

        it("should handle missing Current Season heading", async() => {
            expect.hasAssertions();

            const mockDates = { startDate: "", endDate: "" };
            mockPage.$$eval.mockResolvedValue(mockDates);

            const source: DataSource = { id: "Imaginarium Theater", url: "https://example.com/theater" };
            await parser["parseImaginariumTheater"](source);

            expect(mockDataService.addRecords).toHaveBeenCalledWith(
                "Genshin Impact",
                "events",
                expect.arrayContaining([
                    expect.objectContaining({
                        title: "Imaginarium Theater",
                        startDate: "",
                        endDate: ""
                    })
                ])
            );
        });

        it("should handle parsing errors", async() => {
            expect.hasAssertions();

            mockPage.$$eval.mockRejectedValue(new Error("Selector not found"));

            const source: DataSource = { id: "Imaginarium Theater", url: "https://example.com/theater" };
            await parser["parseImaginariumTheater"](source);

            expect(mockDataService.addRecords).toHaveBeenCalledWith(
                "Genshin Impact",
                "events",
                []
            );
        });
    });

    describe("cleanupExpiredEvents", () => {
        it("should call cleanupExpiredItems with correct parameters", () => {
            parser["cleanupExpiredEvents"]();

            expect(mockDataService.cleanupExpiredItems).toHaveBeenCalledWith(
                "Genshin Impact",
                "events",
                expect.any(Function)
            );
        });

        it("should filter events based on end date", () => {
            parser["cleanupExpiredEvents"]();

            const filterFn = mockDataService.cleanupExpiredItems.mock.calls[0][2] as (event: GenshinEvent) => boolean;

            const futureEvent: GenshinEvent = {
                title: "Future Event",
                startDate: "November 01, 2025",
                endDate: new Date(Date.now() + 86400000).toISOString(),
                url: "https://example.com",
                banner: "https://example.com/banner.png",
                eventType: "temporary",
                completed: false
            };

            const pastEvent: GenshinEvent = {
                title: "Past Event",
                startDate: "October 01, 2025",
                endDate: new Date(Date.now() - 86400000).toISOString(),
                url: "https://example.com",
                banner: "https://example.com/banner.png",
                eventType: "temporary",
                completed: false
            };

            expect(filterFn(futureEvent)).toBe(true);
            expect(filterFn(pastEvent)).toBe(false);
        });

        it("should handle cleanup errors gracefully", async() => {
            expect.hasAssertions();

            mockDataService.cleanupExpiredItems.mockRejectedValue(new Error("Database error"));

            parser["cleanupExpiredEvents"]();
            // Wait for promise to reject
            await new Promise((resolve) => { setTimeout(resolve, 100); });

            // Should not throw, error is caught and logged
            expect(mockDataService.cleanupExpiredItems).toHaveBeenCalled();
        });
    });

    describe("Browser lifecycle", () => {
        it("should close browser even if parsing fails", async() => {
            expect.hasAssertions();

            mockPage.$$eval.mockRejectedValue(new Error("Parse error"));

            const source: DataSource = { id: "Events", url: "https://example.com/events" };
            await parser["parseEvents"](source);

            expect(mockBrowser.close).toHaveBeenCalled();
        });

        it("should setup browser with correct configuration", async() => {
            expect.hasAssertions();

            mockPage.$$eval.mockResolvedValue([]);

            const source: DataSource = { id: "Events", url: "https://example.com/events" };
            await parser["parseEvents"](source);

            expect(jest.mocked(puppeteer.launch)).toHaveBeenCalledWith({ headless: false });
            expect(mockPage.setViewport).toHaveBeenCalledWith({ width: 1920, height: 1080 });
            expect(mockPage.goto).toHaveBeenCalledWith(
                "https://example.com/events",
                { waitUntil: "domcontentloaded" }
            );
        });
    });


    describe("Database operations", () => {
        it("should add records to correct collection", async() => {
            expect.hasAssertions();

            mockPage.$$eval.mockResolvedValue([]);

            const source: DataSource = { id: "Events", url: "https://example.com/events" };
            await parser["parseEvents"](source);

            expect(mockDataService.addRecords).toHaveBeenCalledWith(
                "Genshin Impact",
                "events",
                expect.any(Array)
            );
        });

        it("should disconnect from database after all parsing", async() => {
            expect.hasAssertions();

            mockPage.$$eval.mockResolvedValue([]);
            mockPage.$eval.mockResolvedValue("(NA) Ends in: 5d 10h 30m 15s");

            await parser.parseData();

            expect(mockDataService.disconnect).toHaveBeenCalledTimes(1);
        });

        it("should not disconnect if parsing throws early", async() => {
            expect.hasAssertions();

            const emptyDataFile: DataFile = { id: "test", sourceList: [] };
            const emptyParser = new GenshinImpactParser(emptyDataFile, mockDataService);

            // eslint-disable-next-line jest/require-to-throw-message
            await expect(emptyParser.parseData()).rejects.toThrow();
            expect(mockDataService.disconnect).not.toHaveBeenCalled();
        });
    });
});
