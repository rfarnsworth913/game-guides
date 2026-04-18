import { add, format } from "date-fns";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { formatDate } from "@common/constants";
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

type ParserMethod
    = | "parseEvents"
    | "createStaticEvents"
    | "parseSummonBanners"
    | "parseImaginariumTheater"
    | "parseSpiralAbyss"
    | "parseSourceData";

const invokeParserMethod = async (
    parser: GenshinImpactParser,
    method: ParserMethod,
    ...args: Array<unknown>
): Promise<unknown> => {
    const parserRecord = parser as unknown as Record<string, unknown>;
    const targetMethod = parserRecord[method];

    if (typeof targetMethod !== "function") {
        throw new Error(`Method ${method} is not a function`);
    }

    return (targetMethod as (...methodArgs: Array<unknown>) => Promise<unknown>).apply(parser, args);
};

const spyOnParserMethod = (
    parser: GenshinImpactParser,
    methodName: string
) => {
    const parserRecord = parser as unknown as Record<string, (...methodArgs: Array<unknown>) => unknown>;
    return jest.spyOn(parserRecord, methodName);
};

const mockBrowserController = (
    parser: GenshinImpactParser,
    pageMock: unknown
): void => {
    spyOnParserMethod(parser, "browserController")
        .mockImplementation(async (_url: string, callback: (page: unknown) => Promise<unknown>) => callback(pageMock));
};


// Test Suite -----------------------------------------------------------------
describe("Genshin Impact Parser Unit Tests", () => {

    // Tests Setup ------------------------------------------------------------
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("Static Events Handling", () => {
        it("createStaticEvents creates static records including artifacts", async () => {
            expect.hasAssertions();

            const { parser, service } = createParser();

            const rawDate = "January 16, 2026 04:00:00 AM";
            const expectedStart = format(new Date(rawDate), formatDate);
            const expectedEnd = format(add(new Date(rawDate), { weeks: 6 }), formatDate);

            (parser as unknown as { versionInfo: { releaseDate: string } }).versionInfo = { releaseDate: rawDate };

            await invokeParserMethod(parser, "createStaticEvents");

            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", expect.arrayContaining([
                expect.objectContaining({
                    title: "Artifact Extraction",
                    startDate: expectedStart,
                    endDate: expectedEnd,
                    eventType: EventType.Crafting
                }),
                expect.objectContaining({
                    title: "Artifact Definition",
                    startDate: expectedStart,
                    endDate: expectedEnd,
                    eventType: EventType.Crafting
                })
            ]));
        });
    });

    describe("Events Handling", () => {
        it("parseEvents parses event rows successfully", async () => {
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

        it("parseEvents handles invalid date content", async () => {
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
        it("parseImaginariumTheater parses season duration", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Imaginarium Theater", url: "https://example.com/theater" };
            const { parser, service } = createParser([source]);

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getElementByText").mockImplementation(async () => ({}));
            spyOnParserMethod(parser, "getTextContent").mockImplementation(async () => "Season 7 January 1, 2026 – February 1, 2026");

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

        it("parseImaginariumTheater handles missing season text", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Imaginarium Theater", url: "https://example.com/theater" };
            const { parser, service } = createParser([source]);
            const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => null);

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getElementByText").mockImplementation(async () => null);

            await invokeParserMethod(parser, "parseImaginariumTheater", source);

            expect(warnSpy).toHaveBeenCalled();
            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", []);
        });
    });

    describe("Source Data Controller", () => {
        it("parseSourceData dispatches known sources and warns on unknown source", async () => {
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

            const getVersionInfo = spyOnParserMethod(parser, "getVersionInfo").mockImplementation(async () => null);
            const createStaticEvents = spyOnParserMethod(parser, "createStaticEvents").mockImplementation(async () => null);
            const parseSummonBanners = spyOnParserMethod(parser, "parseSummonBanners").mockImplementation(async () => null);
            const parseEvents = spyOnParserMethod(parser, "parseEvents").mockImplementation(async () => null);
            const parseImaginariumTheater = spyOnParserMethod(parser, "parseImaginariumTheater").mockImplementation(async () => null);
            const parseSpiralAbyss = spyOnParserMethod(parser, "parseSpiralAbyss").mockImplementation(async () => null);

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

    describe("Spiral Abyss Handling", () => {
        it("parseSpiralAbyss parses duration successfully", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Spiral Abyss", url: "https://example.com/abyss" };
            const { parser, service } = createParser([source]);

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getElementByText").mockImplementation(async () => ({}));
            spyOnParserMethod(parser, "getTextContent").mockImplementation(async () => "Duration: January 16, 2026 – February 16, 2026");

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

        it("parseSpiralAbyss handles missing duration text", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Spiral Abyss", url: "https://example.com/abyss" };
            const { parser, service } = createParser([source]);
            const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => null);

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getElementByText").mockImplementation(async () => null);

            await invokeParserMethod(parser, "parseSpiralAbyss", source);

            expect(warnSpy).toHaveBeenCalled();
            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", []);
        });
    });

    describe("Summoning Banners Handling", () => {
        it("parseSummonBanners parses banner events successfully", async () => {
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
            spyOnParserMethod(parser, "getTableByHeaderText").mockImplementation(async () => ({}));
            spyOnParserMethod(parser, "extractBannerEvents").mockImplementation(async () => expectedEvents);

            await invokeParserMethod(parser, "parseSummonBanners", source);

            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", expectedEvents);
        });

        it("parseSummonBanners handles missing table", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Banners", url: "https://example.com/banners" };
            const { parser, service } = createParser([source]);
            const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => null);

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getTableByHeaderText").mockImplementation(async () => null);

            await invokeParserMethod(parser, "parseSummonBanners", source);

            expect(warnSpy).toHaveBeenCalled();
            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", []);
        });
    });
});
