import { endOfISOWeek, endOfMonth, format, startOfISOWeek, startOfMonth, sub } from "date-fns";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { formatDate } from "@common/constants";
import { EventType } from "@common/enums";
import { DataFile, DataSource } from "@common/types";
import { DataService } from "../services";
import { WutheringWavesParser } from "./wuthering-waves";


// Setup Parser Fixture -------------------------------------------------------
type ParserFixture = {
    parser: WutheringWavesParser;
    service: {
        addRecords: jest.Mock;
    };
};

const createParser = (sourceList: Array<DataSource> = []): ParserFixture => {
    const dataFile: DataFile = {
        id: "Wuthering Waves",
        sourceList
    };

    const service = {
        addRecords: jest.fn(() => null)
    };

    const parser = new WutheringWavesParser(dataFile, service as unknown as DataService);

    return { parser, service };
};

type ParserMethod
    = | "createStaticEvents"
    | "parseSourceData"
    | "parseEvents"
    | "doubledPawnsMatrix"
    | "parseTowerOfAdversity"
    | "parseWhimperingWastes";

const invokeParserMethod = async (
    parser: WutheringWavesParser,
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
    parser: WutheringWavesParser,
    methodName: string
) => {
    const parserRecord = parser as unknown as Record<string, (...methodArgs: Array<unknown>) => unknown>;
    return jest.spyOn(parserRecord, methodName);
};

const mockBrowserController = (
    parser: WutheringWavesParser,
    pageMock: unknown
): void => {
    spyOnParserMethod(parser, "browserController")
        .mockImplementation(async (_url: string, callback: (page: unknown) => Promise<unknown>) => callback(pageMock));
};


// Test Suite -----------------------------------------------------------------
describe("Wuthering Waves Parser Unit Tests", () => {

    // Tests Setup ------------------------------------------------------------
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("Static Events Handling", () => {
        it("createStaticEvents creates all static records", async () => {
            expect.hasAssertions();

            const { parser, service } = createParser();

            const today = format(new Date(), formatDate);
            const weekStart = format(startOfISOWeek(new Date()), formatDate);
            const weekEnd = format(endOfISOWeek(new Date()), formatDate);
            const monthStart = format(startOfMonth(new Date()), formatDate);
            const monthEnd = format(endOfMonth(new Date()), formatDate);

            await invokeParserMethod(parser, "createStaticEvents");

            expect(service.addRecords).toHaveBeenCalledWith("Wuthering Waves", "events", [
                {
                    title: "Daily Activities",
                    url: "https://wutheringwaves.fandom.com/wiki/Guidebook/Activity",
                    icon: "icons/wuthering-waves/daily-activities.svg",
                    startDate: today,
                    endDate: today,
                    eventType: EventType.Daily,
                    completed: false
                },
                {
                    title: "Weekly Challenge",
                    url: "https://wutheringwaves.fandom.com/wiki/Weekly_Challenge",
                    icon: "icons/wuthering-waves/weekly-challenge.svg",
                    startDate: weekStart,
                    endDate: weekEnd,
                    eventType: EventType.Weekly,
                    completed: false
                },
                {
                    title: "Fantasies of the Thousand Gateways",
                    url: "https://wutheringwaves.fandom.com/wiki/Fantasies_of_the_Thousand_Gateways",
                    icon: "icons/wuthering-waves/fantasies-of-the-thousand-gateways.svg",
                    startDate: weekStart,
                    endDate: weekEnd,
                    eventType: EventType.Weekly,
                    completed: false
                },
                {
                    title: "Shop Reset",
                    url: "",
                    icon: "icons/wuthering-waves/shop-reset.svg",
                    startDate: monthStart,
                    endDate: monthEnd,
                    eventType: EventType.Monthly,
                    completed: false
                }
            ]);
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
                        title: "Web Event: Echoes",
                        url: "https://example.com/echoes",
                        startDate: "January 10, 2026",
                        endDate: "January 20, 2026"
                    }
                ])
            };

            mockBrowserController(parser, pageMock);

            await invokeParserMethod(parser, "parseEvents", source);

            expect(service.addRecords).toHaveBeenCalledWith("Wuthering Waves", "events", [
                {
                    title: "Web Event: Echoes",
                    url: "https://example.com/echoes",
                    icon: "icons/wuthering-waves/web.svg",
                    startDate: "2026-01-10",
                    endDate: "2026-01-20",
                    eventType: EventType.Web,
                    completed: false
                }
            ]);
        });

        it("parseEvents handles invalid and open-ended dates", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Events", url: "https://example.com/events" };
            const { parser, service } = createParser([source]);

            const pageMock = {
                $$eval: jest.fn(() => [
                    {
                        title: "Unknown Challenge",
                        url: "https://example.com/challenge",
                        startDate: "invalid-start",
                        endDate: "invalid-end"
                    },
                    {
                        title: "Permanent Storyline",
                        url: "https://example.com/permanent",
                        startDate: "January 11, 2026",
                        endDate: ""
                    }
                ])
            };

            mockBrowserController(parser, pageMock);

            await invokeParserMethod(parser, "parseEvents", source);

            expect(service.addRecords).toHaveBeenCalledWith("Wuthering Waves", "events", [
                {
                    title: "Unknown Challenge",
                    url: "https://example.com/challenge",
                    icon: "icons/wuthering-waves/temporary.svg",
                    startDate: "",
                    endDate: "",
                    eventType: EventType.Temporary,
                    completed: false
                },
                {
                    title: "Permanent Storyline",
                    url: "https://example.com/permanent",
                    icon: "icons/wuthering-waves/permanent.svg",
                    startDate: "2026-01-11",
                    endDate: "",
                    eventType: EventType.Permanent,
                    completed: false
                }
            ]);
        });
    });

    describe("Doubled Pawns Matrix Handling", () => {
        it("doubledPawnsMatrix parses reset duration", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Doubled Pawns Matrix", url: "https://example.com/matrix" };
            const { parser, service } = createParser([source]);

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getElementByText").mockImplementation(async () => ({}));
            spyOnParserMethod(parser, "getTextContent")
                .mockImplementation(async () => "Doubled Pawns Matrix Stages January 01, 2026 - January 15, 2026");

            await invokeParserMethod(parser, "doubledPawnsMatrix", source);

            expect(service.addRecords).toHaveBeenCalledWith("Wuthering Waves", "events", [
                {
                    title: "Doubled Pawns Matrix",
                    url: source.url,
                    icon: "icons/wuthering-waves/doubled-pawns-matrix.svg",
                    startDate: "2026-01-01",
                    endDate: "2026-01-15",
                    eventType: EventType.Monthly,
                    completed: false
                }
            ]);
        });

        it("doubledPawnsMatrix handles missing reset element", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Doubled Pawns Matrix", url: "https://example.com/matrix" };
            const { parser, service } = createParser([source]);

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getElementByText").mockImplementation(async () => null);

            await invokeParserMethod(parser, "doubledPawnsMatrix", source);

            expect(service.addRecords).toHaveBeenCalledWith("Wuthering Waves", "events", []);
        });
    });

    describe("Tower of Adversity Handling", () => {
        it("parseTowerOfAdversity parses reset date successfully", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Tower of Adversity", url: "https://example.com/tower" };
            const { parser, service } = createParser([source]);

            const resetDate = new Date("February 1, 2026");

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getElementByText").mockImplementation(async () => ({}));
            spyOnParserMethod(parser, "getTextContent").mockImplementation(async () => "Resets on February 1, 2026");

            await invokeParserMethod(parser, "parseTowerOfAdversity", source);

            expect(service.addRecords).toHaveBeenCalledWith("Wuthering Waves", "events", [
                {
                    title: "Tower of Adversity",
                    url: source.url,
                    icon: "icons/wuthering-waves/tower-of-adversity.svg",
                    startDate: format(sub(resetDate, { days: 28 }), formatDate),
                    endDate: format(resetDate, formatDate),
                    eventType: EventType.Monthly,
                    completed: false
                }
            ]);
        });

        it("parseTowerOfAdversity handles invalid reset date", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Tower of Adversity", url: "https://example.com/tower" };
            const { parser, service } = createParser([source]);

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getElementByText").mockImplementation(async () => ({}));
            spyOnParserMethod(parser, "getTextContent").mockImplementation(async () => "Resets on invalid-date");

            await invokeParserMethod(parser, "parseTowerOfAdversity", source);

            expect(service.addRecords).toHaveBeenCalledWith("Wuthering Waves", "events", []);
        });
    });

    describe("Whimpering Wastes Handling", () => {
        it("parseWhimperingWastes parses reset date successfully", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Whimpering Wastes", url: "https://example.com/wastes" };
            const { parser, service } = createParser([source]);

            const resetDate = new Date("March 1, 2026");

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getElementByText").mockImplementation(async () => ({}));
            spyOnParserMethod(parser, "getTextContent").mockImplementation(async () => "Resets on March 1, 2026");

            await invokeParserMethod(parser, "parseWhimperingWastes", source);

            expect(service.addRecords).toHaveBeenCalledWith("Wuthering Waves", "events", [
                {
                    title: "Whimpering Wastes",
                    url: source.url,
                    icon: "icons/wuthering-waves/whimpering-wastes.svg",
                    startDate: format(sub(resetDate, { days: 28 }), formatDate),
                    endDate: format(resetDate, formatDate),
                    eventType: EventType.Monthly,
                    completed: false
                }
            ]);
        });

        it("parseWhimperingWastes handles missing reset text", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Whimpering Wastes", url: "https://example.com/wastes" };
            const { parser, service } = createParser([source]);

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getElementByText").mockImplementation(async () => ({}));
            spyOnParserMethod(parser, "getTextContent").mockImplementation(async () => "");

            await invokeParserMethod(parser, "parseWhimperingWastes", source);

            expect(service.addRecords).toHaveBeenCalledWith("Wuthering Waves", "events", []);
        });
    });

    describe("Source Data Controller", () => {
        it("parseSourceData dispatches known sources and warns on unknown source", async () => {
            expect.hasAssertions();

            const sources: Array<DataSource> = [
                { id: "Version", url: "https://example.com/version" },
                { id: "Doubled Pawns Matrix", url: "https://example.com/matrix" },
                { id: "Events", url: "https://example.com/events" },
                { id: "Tower of Adversity", url: "https://example.com/tower" },
                { id: "Whimpering Wastes", url: "https://example.com/wastes" },
                { id: "Unknown", url: "https://example.com/unknown" }
            ];

            const { parser } = createParser(sources);
            const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => null);

            const getVersionInfo = spyOnParserMethod(parser, "getVersionInfo").mockImplementation(async () => null);
            const createStaticEvents = spyOnParserMethod(parser, "createStaticEvents").mockImplementation(async () => null);
            const doubledPawnsMatrix = spyOnParserMethod(parser, "doubledPawnsMatrix").mockImplementation(async () => null);
            const parseEvents = spyOnParserMethod(parser, "parseEvents").mockImplementation(async () => null);
            const parseTowerOfAdversity = spyOnParserMethod(parser, "parseTowerOfAdversity").mockImplementation(async () => null);
            const parseWhimperingWastes = spyOnParserMethod(parser, "parseWhimperingWastes").mockImplementation(async () => null);

            await invokeParserMethod(parser, "parseSourceData");

            expect(getVersionInfo).toHaveBeenCalledWith(sources[0]);
            expect(createStaticEvents).toHaveBeenCalledTimes(1);
            expect(doubledPawnsMatrix).toHaveBeenCalledWith(sources[1]);
            expect(parseEvents).toHaveBeenCalledWith(sources[2]);
            expect(parseTowerOfAdversity).toHaveBeenCalledWith(sources[3]);
            expect(parseWhimperingWastes).toHaveBeenCalledWith(sources[4]);
            expect(warnSpy).toHaveBeenCalled();
        });
    });
});
