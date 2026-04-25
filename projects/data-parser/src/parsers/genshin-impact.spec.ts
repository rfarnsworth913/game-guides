import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { EventType } from "@common/enums";
import { DataFile, DataSource } from "@common/types";
import { DataService } from "../services";
import { GenshinImpactParser } from "./genshin-impact";


// Setup Parser Fixture -------------------------------------------------------
type ParserFixture = {
    parser: GenshinImpactParser;
    service: {
        addRecords: jest.Mock;
    };
};

type ParserMethod = | "parseEvents" | "createStaticEvents" | "parseSummonBanners" | "parseImaginariumTheater" | "parseSpiralAbyss" | "parseSourceData";

const createParser = (sourceList: Array<DataSource> = []): ParserFixture => {
    const dataFile: DataFile = {
        id: "Genshin Impact",
        sourceList
    };

    const service = {
        addRecords: jest.fn(() => null)
    };

    const parser = new GenshinImpactParser(dataFile, service as unknown as DataService);

    return { parser, service };
};

// eslint-disable-next-line @stylistic/max-len
const invokeParserMethod = async (parser: GenshinImpactParser, method: ParserMethod, ...args: Array<unknown>): Promise<unknown> => {
    const parserRecord = parser as unknown as Record<string, unknown>;
    const targetMethod = parserRecord[method];

    if (typeof targetMethod !== "function") {
        throw new Error(`Method ${method} is not a function`);
    }

    return (targetMethod as (...methodArgs: Array<unknown>) => Promise<unknown>).apply(parser, args);
};

const spyOnParserMethod = (parser: GenshinImpactParser, methodName: string) => {
    const parserRecord = parser as unknown as Record<string, (...methodArgs: Array<unknown>) => unknown>;
    return jest.spyOn(parserRecord, methodName);
};

const mockBrowserController = (parser: GenshinImpactParser, pageMock: unknown): void => {
    spyOnParserMethod(parser, "browserController")
        .mockImplementation(async (_url: string, callback: (page: unknown) => Promise<unknown>) => callback(pageMock));
};


// Test Suite -----------------------------------------------------------------
describe("Genshin Impact Parser Unit Tests", () => {

    // Tests Setup ------------------------------------------------------------
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("Source Data Controller", () => {
        it("should correctly parse source data and handle unknown sources", async () => {
            expect.hasAssertions();

            const sources: Array<DataSource> = [
                { id: "Version", url: "https://example.com/version" },
                { id: "Banners", url: "https://example.com/banners" },
                { id: "Events", url: "https://example.com/events" },
                { id: "Imaginarium Theater", url: "https://example.com/theater" },
                { id: "Spiral Abyss", url: "https://example.com/abyss" },
                { id: "Unknown", url: "https://example.com/unknown" }
            ];

            const { parser } = createParser(sources);
            const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => null);

            const getVersionInfo = spyOnParserMethod(parser, "getVersionInfo").mockImplementation(() => null);
            const createStaticEvents = spyOnParserMethod(parser, "createStaticEvents").mockImplementation(() => null);
            const parseSummonBanners = spyOnParserMethod(parser, "parseSummonBanners").mockImplementation(() => null);
            const parseEvents = spyOnParserMethod(parser, "parseEvents").mockImplementation(() => null);
            const parseImaginariumTheater = spyOnParserMethod(parser, "parseImaginariumTheater").mockImplementation(() => null);
            const parseSpiralAbyss = spyOnParserMethod(parser, "parseSpiralAbyss").mockImplementation(() => null);

            await invokeParserMethod(parser, "parseSourceData");

            expect(getVersionInfo).toHaveBeenCalledWith(sources[0]);
            expect(createStaticEvents).toHaveBeenCalledTimes(1);
            expect(parseSummonBanners).toHaveBeenCalledWith(sources[1]);
            expect(parseEvents).toHaveBeenCalledWith(sources[2]);
            expect(parseImaginariumTheater).toHaveBeenCalledWith(sources[3]);
            expect(parseSpiralAbyss).toHaveBeenCalledWith(sources[4]);
            expect(warnSpy).toHaveBeenCalled();
        });
    });

    describe("Events Handling", () => {
        it("should parse event data successfully", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Events", url: "https://example.com/events" };
            const { parser, service } = createParser([source]);

            const pageMock = {
                $$eval: jest.fn(() => [
                    {
                        title: "Lantern Rite",
                        url: "https://example.com/lantern-rite",
                        startDate: "January 10, 2026",
                        endDate: "January 20, 2026",
                        thirdColumn: "Web Event"
                    }
                ])
            };

            mockBrowserController(parser, pageMock);

            await invokeParserMethod(parser, "parseEvents", source);

            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", [
                {
                    title: "Lantern Rite",
                    url: "https://example.com/lantern-rite",
                    icon: "icons/genshin-impact/web.svg",
                    startDate: "2026-01-10",
                    endDate: "2026-01-20",
                    eventType: EventType.Web,
                    completed: false
                }
            ]);
        });

        it("should handle invalid date content", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Events", url: "https://example.com/events" };
            const { parser, service } = createParser([source]);

            const pageMock = {
                $$eval: jest.fn(() => [
                    {
                        title: "Unknown Event",
                        url: "https://example.com/unknown",
                        startDate: "invalid-start",
                        endDate: "invalid-end",
                        thirdColumn: "temporary"
                    }
                ])
            };

            mockBrowserController(parser, pageMock);

            await invokeParserMethod(parser, "parseEvents", source);

            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", [
                {
                    title: "Unknown Event",
                    url: "https://example.com/unknown",
                    icon: "icons/genshin-impact/temporary.svg",
                    startDate: "",
                    endDate: "",
                    eventType: EventType.Temporary,
                    completed: false
                }
            ]);
        });
    });

    describe("Imaginarium Theater Handling", () => {
        it("should successfully parse Imaginarium Theater season duration", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Imaginarium Theater", url: "https://example.com/theater" };
            const { parser, service } = createParser([source]);

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getElementByText").mockImplementation(() => ({}));
            spyOnParserMethod(parser, "getTextContent").mockImplementation(() => "Season 7 January 1, 2026 – February 1, 2026");

            await invokeParserMethod(parser, "parseImaginariumTheater", source);

            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", [
                {
                    title: "Imaginarium Theater",
                    url: source.url,
                    icon: "icons/genshin-impact/imaginarium-theater.svg",
                    startDate: "2026-01-01",
                    endDate: "2026-02-01",
                    eventType: EventType.EndGame,
                    completed: false
                }
            ]);
        });

        it("should handle missing season text in Imaginarium Theater", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Imaginarium Theater", url: "https://example.com/theater" };
            const { parser, service } = createParser([source]);
            const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => null);

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getElementByText").mockImplementation(() => null);

            await invokeParserMethod(parser, "parseImaginariumTheater", source);

            expect(warnSpy).toHaveBeenCalled();
            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", []);
        });
    });

    describe("Spiral Abyss Handling", () => {
        it("should successfully parse Spiral Abyss duration", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Spiral Abyss", url: "https://example.com/abyss" };
            const { parser, service } = createParser([source]);

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getElementByText").mockImplementation(() => ({}));
            spyOnParserMethod(parser, "getTextContent").mockImplementation(() => "Duration: January 16, 2026 – February 16, 2026");

            await invokeParserMethod(parser, "parseSpiralAbyss", source);

            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", [
                {
                    title: "Spiral Abyss",
                    url: source.url,
                    icon: "icons/genshin-impact/spiral-abyss.svg",
                    startDate: "2026-01-16",
                    endDate: "2026-02-16",
                    eventType: EventType.EndGame,
                    completed: false
                }
            ]);
        });

        it("should handle missing Spiral Abyss duration text", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Spiral Abyss", url: "https://example.com/abyss" };
            const { parser, service } = createParser([source]);
            const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => null);

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getElementByText").mockImplementation(() => null);

            await invokeParserMethod(parser, "parseSpiralAbyss", source);

            expect(warnSpy).toHaveBeenCalled();
            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", []);
        });
    });

    describe("Summoning Banners Handling", () => {
        it("should successfully parse banner events", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Banners", url: "https://example.com/banners" };
            const { parser, service } = createParser([source]);

            const expectedEvents = [{
                title: "Epitome Invocation",
                url: "https://example.com/banner",
                icon: "icons/genshin-impact/banner-0.svg",
                startDate: "2026-01-10",
                endDate: "2026-01-31",
                eventType: EventType.Banner,
                completed: false
            }];

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getTableByHeaderText").mockImplementation(() => ({}));
            spyOnParserMethod(parser, "extractBannerEvents").mockImplementation(() => expectedEvents);

            await invokeParserMethod(parser, "parseSummonBanners", source);

            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", expectedEvents);
        });

        it("should handle missing table", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Banners", url: "https://example.com/banners" };
            const { parser, service } = createParser([source]);
            const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => null);

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getTableByHeaderText").mockImplementation(() => null);

            await invokeParserMethod(parser, "parseSummonBanners", source);

            expect(warnSpy).toHaveBeenCalled();
            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", []);
        });
    });
});
