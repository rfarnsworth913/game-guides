import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { EventType } from "@common/enums";
import { DataFile, DataSource } from "@common/types";
import { DataService } from "../services";
import { HonkaiStarRailParser } from "./honkai-star-rail";


// Setup Parser Fixture -------------------------------------------------------
type ParserFixture = {
    parser: HonkaiStarRailParser;
    service: {
        addRecords: jest.Mock;
    };
};

type ParserMethod = | "parseEvents" | "parseTreasuresLightward" | "parseSourceData" | "createStaticEvents";

const createParser = (sourceList: Array<DataSource> = []): ParserFixture => {
    const dataFile: DataFile = {
        id: "Honkai Star Rail",
        sourceList
    };

    const service = {
        addRecords: jest.fn(() => null)
    };

    const parser = new HonkaiStarRailParser(dataFile, service as unknown as DataService);

    return { parser, service };
};

// eslint-disable-next-line @stylistic/max-len
const invokeParserMethod = async (parser: HonkaiStarRailParser, method: ParserMethod, ...args: Array<unknown>): Promise<unknown> => {
    const parserRecord = parser as unknown as Record<string, unknown>;
    const targetMethod = parserRecord[method];

    if (typeof targetMethod !== "function") {
        throw new Error(`Method ${method} is not a function`);
    }

    return (targetMethod as (...methodArgs: Array<unknown>) => Promise<unknown>).apply(parser, args);
};

const spyOnParserMethod = (parser: HonkaiStarRailParser, methodName: string) => {
    const parserRecord = parser as unknown as Record<string, (...methodArgs: Array<unknown>) => unknown>;
    return jest.spyOn(parserRecord, methodName);
};

const mockBrowserController = (parser: HonkaiStarRailParser, pageMock: unknown): void => {
    spyOnParserMethod(parser, "browserController")
        .mockImplementation(async (_url: string, callback: (page: unknown) => Promise<unknown>) => callback(pageMock));
};


// Test Suite -----------------------------------------------------------------
describe("Honkai Star Rail Parser Unit Tests", () => {

    // Tests Setup ------------------------------------------------------------
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("Events Handling", () => {
        it("should parse events successfully", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Events", url: "https://example.com/events" };
            const { parser, service } = createParser([source]);

            const pageMock = {
                $$eval: jest.fn(() => [
                    {
                        title: "Planar Fissure",
                        url: "https://example.com/planar-fissure",
                        startDate: "February 3, 2026",
                        endDate: "February 24, 2026",
                        thirdColumn: "temporary"
                    }
                ])
            };

            mockBrowserController(parser, pageMock);

            await invokeParserMethod(parser, "parseEvents", source);

            expect(service.addRecords).toHaveBeenCalledWith("Honkai Star Rail", "events", [
                {
                    title: "Planar Fissure",
                    url: "https://example.com/planar-fissure",
                    icon: "icons/honkai-star-rail/temporary.svg",
                    startDate: "2026-02-03",
                    endDate: "2026-02-24",
                    eventType: EventType.Temporary,
                    completed: false
                }
            ]);
        });

        it("should handle invalid data", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Events", url: "https://example.com/events" };
            const { parser, service } = createParser([source]);

            const pageMock = {
                $$eval: jest.fn(() => [
                    {
                        title: "Unknown Event",
                        url: "https://example.com/unknown-event",
                        startDate: "invalid-start",
                        endDate: "invalid-end",
                        thirdColumn: "web"
                    },
                    {
                        title: "Permanent Event",
                        url: "https://example.com/permanent-event",
                        startDate: "February 10, 2026",
                        endDate: "",
                        thirdColumn: "indefinite"
                    }
                ])
            };

            mockBrowserController(parser, pageMock);

            await invokeParserMethod(parser, "parseEvents", source);

            expect(service.addRecords).toHaveBeenCalledWith("Honkai Star Rail", "events", [
                {
                    title: "Unknown Event",
                    url: "https://example.com/unknown-event",
                    icon: "icons/honkai-star-rail/web.svg",
                    startDate: "",
                    endDate: "",
                    eventType: EventType.Web,
                    completed: false
                }
            ]);
        });
    });

    describe("Treasures Lightward Handling", () => {
        it("parseTreasuresLightward parses date row successfully", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Pure Fiction", url: "https://example.com/pure-fiction" };
            const { parser, service } = createParser([source]);

            const tableElementMock = {
                evaluate: jest.fn(async () => ({
                    startDate: "January 15, 2026 04:00 (GMT+8)",
                    endDate: "February 26, 2026 03:59 (GMT+8)"
                }))
            };

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getTableByHeaderText").mockImplementation(() => tableElementMock as never);

            await invokeParserMethod(parser, "parseTreasuresLightward", source);

            expect(service.addRecords).toHaveBeenCalledWith("Honkai Star Rail", "events", [
                {
                    title: "Pure Fiction",
                    url: "https://example.com/pure-fiction",
                    icon: "icons/honkai-star-rail/pure-fiction.svg",
                    startDate: "2026-01-15",
                    endDate: "2026-02-26",
                    eventType: EventType.EndGame,
                    completed: false
                }
            ]);
        });

        it("parseTreasuresLightward handles missing history table", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Apocalyptic Shadow", url: "https://example.com/apoc" };
            const { parser, service } = createParser([source]);
            const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => null);

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getTableByHeaderText").mockImplementation(() => null);

            await invokeParserMethod(parser, "parseTreasuresLightward", source);

            expect(warnSpy).toHaveBeenCalled();
            expect(service.addRecords).toHaveBeenCalledWith("Honkai Star Rail", "events", []);
        });

        it("parseTreasuresLightward handles invalid date parsing", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Anomaly Arbitration", url: "https://example.com/anomaly" };
            const { parser, service } = createParser([source]);
            const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => null);

            const tableElementMock = {
                evaluate: jest.fn(() => ({
                    startDate: "not-a-date",
                    endDate: "also-not-a-date"
                }))
            };

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getTableByHeaderText").mockImplementation(() => tableElementMock as never);

            await invokeParserMethod(parser, "parseTreasuresLightward", source);

            expect(warnSpy).toHaveBeenCalled();
            expect(service.addRecords).toHaveBeenCalledWith("Honkai Star Rail", "events", []);
        });
    });

    describe("Source Data Controller", () => {
        it("parseSourceData dispatches known sources and warns on unknown source", async () => {
            expect.hasAssertions();

            const sources: Array<DataSource> = [
                { id: "Version", url: "https://example.com/version" },
                { id: "Anomaly Arbitration", url: "https://example.com/anomaly" },
                { id: "Apocalyptic Shadow", url: "https://example.com/apoc" },
                { id: "Events", url: "https://example.com/events" },
                { id: "Forgotten Hall", url: "https://example.com/fh" },
                { id: "Pure Fiction", url: "https://example.com/pf" },
                { id: "Unknown", url: "https://example.com/unknown" }
            ];

            const { parser } = createParser(sources);
            const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => null);

            const getVersionInfo = spyOnParserMethod(parser, "getVersionInfo").mockImplementation(async () => null);
            const createStaticEvents = spyOnParserMethod(parser, "createStaticEvents").mockImplementation(async () => null);
            const parseTreasuresLightward = spyOnParserMethod(parser, "parseTreasuresLightward").mockImplementation(async () => null);
            const parseEvents = spyOnParserMethod(parser, "parseEvents").mockImplementation(async () => null);

            await invokeParserMethod(parser, "parseSourceData");

            expect(getVersionInfo).toHaveBeenCalledWith(sources[0]);
            expect(createStaticEvents).toHaveBeenCalledTimes(1);
            expect(parseTreasuresLightward).toHaveBeenNthCalledWith(1, sources[1]);
            expect(parseTreasuresLightward).toHaveBeenNthCalledWith(2, sources[2]);
            expect(parseEvents).toHaveBeenCalledWith(sources[3]);
            expect(parseTreasuresLightward).toHaveBeenNthCalledWith(3, sources[4], "h3");
            expect(parseTreasuresLightward).toHaveBeenNthCalledWith(4, sources[5]);
            expect(warnSpy).toHaveBeenCalled();
        });
    });
});
