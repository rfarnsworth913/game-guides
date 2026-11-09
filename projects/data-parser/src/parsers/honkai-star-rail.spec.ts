import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { EventType } from "@shared-lib/enums";
import type { DataFile, DataSource, Version } from "@shared-lib/types";

import { DataService } from "../services";
import { HonkaiStarRailParser } from "./honkai-star-rail";


// Setup Parser Fixture -------------------------------------------------------
type ParserFixture = {
    parser: HonkaiStarRailParser;
    service: {
        addRecords: Mock<DataService["addRecords"]>;
        updateVersion: Mock<DataService["updateVersion"]>;
    };
};

type ParserMethod = | "getVersionInfo" | "parseEvents" | "parseTreasuresLightward" | "parseSourceData" | "createStaticEvents";

const createParser = (sourceList: Array<DataSource> = []): ParserFixture => {
    const dataFile: DataFile = {
        id: "Honkai Star Rail",
        sourceList
    };

    const service = {
        addRecords: vi.fn<DataService["addRecords"]>().mockResolvedValue(globalThis.undefined),
        updateVersion: vi.fn<DataService["updateVersion"]>().mockResolvedValue(true),
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
    return vi.spyOn(parserRecord, methodName);
};

const mockBrowserController = (parser: HonkaiStarRailParser, pageMock: unknown): void => {
    spyOnParserMethod(parser, "browserController")
        .mockImplementation(async (...args: Array<unknown>) => {
            const callback = args[1] as (page: unknown) => Promise<unknown>;
            return callback(pageMock);
        });
};

// jsdom has no bundled declarations; describe the DOM surface used by these fixtures.
const loadModule = createRequire(`${process.cwd()}/package.json`);
const { JSDOM } = loadModule("jsdom") as {
    JSDOM: new (html: string, options: { url: string }) => { window: Window & { close: () => void } };
};
const windows: Array<Window & { close: () => void }> = [];
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const version: Version = { title: "4.0: A New Journey", releaseDate: "2026-01-14", url: "https://example.com/wiki/4.0" };
const versionState = (parser: HonkaiStarRailParser) => parser as unknown as { versionInfo: Version; isNewVersion: boolean };

/** Execute both Page.evaluate and ElementHandle.evaluate against local HTML. */
function mockHtmlPage (parser: HonkaiStarRailParser, html: string) {
    const dom = new JSDOM(html, { url: "https://example.com/wiki/source" });
    windows.push(dom.window);
    Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
    const table = dom.window.document.querySelector("table");
    const evaluate = (callback: (element: Element) => unknown) => {
        if (!table) { throw new Error("Unexpected extraction without a table."); }
        return Promise.resolve(callback(table));
    };
    mockBrowserController(parser, {
        evaluate,
        $$eval: (selector: string, callback: (elements: Array<Element>) => unknown) =>
            Promise.resolve(callback(Array.from(dom.window.document.querySelectorAll(selector)))),
    });
    return spyOnParserMethod(parser, "getTableByHeaderText").mockImplementation(() =>
        Promise.resolve(table ? { evaluate } : null));
}


// Test Suite -----------------------------------------------------------------
describe("Honkai Star Rail Parser Unit Tests", () => {

    // Tests Setup ------------------------------------------------------------
    beforeEach(() => {
        vi.useFakeTimers().setSystemTime(new Date(2026, 0, 21, 12));
    });

    afterEach(() => {
        windows.splice(0).forEach(window => window.close());
        if (originalWindow) {
            Object.defineProperty(globalThis, "window", originalWindow);
        } else {
            Reflect.deleteProperty(globalThis, "window");
        }
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe("Static event resets", () => {
        it("creates the daily, weekly, monthly and linked weekly activities", async () => {
            expect.hasAssertions();
            const { parser, service } = createParser();
            await invokeParserMethod(parser, "createStaticEvents");
            const events = service.addRecords.mock.calls[0][2];
            expect(service.addRecords).toHaveBeenCalledWith("Honkai Star Rail", "events", events);
            expect(events).toHaveLength(5);
            expect(events).toEqual(expect.arrayContaining([
                expect.objectContaining({ title: "Daily Training", startDate: "2026-01-21", endDate: "2026-01-21", eventType: EventType.Daily }),
                expect.objectContaining({ title: "Echo of War", startDate: "2026-01-19", endDate: "2026-01-25", eventType: EventType.Weekly }),
                expect.objectContaining({ title: "Embers Exchange", startDate: "2026-01-01", endDate: "2026-01-31", eventType: EventType.Monthly }),
                expect.objectContaining({ title: "Currency Wars", startDate: "2026-01-19", endDate: "2026-01-25", eventType: EventType.WeeklyLinked }),
                expect.objectContaining({ title: "Simulated Universe", startDate: "2026-01-19", endDate: "2026-01-25", eventType: EventType.WeeklyLinked }),
            ]));
            expect(events.every(event => "completed" in event && event.completed === false &&
                "url" in event && typeof event.url === "string" && event.url.length > 0 &&
                "icon" in event && typeof event.icon === "string" && event.icon.length > 0)).toBe(true);
        });

        it.each([
            [new Date(2026, 0, 19, 12), "2026-01-19", "2026-01-25", "2026-01-31"],
            [new Date(2026, 0, 25, 12), "2026-01-19", "2026-01-25", "2026-01-31"],
            [new Date(2026, 11, 31, 12), "2026-12-28", "2027-01-03", "2026-12-31"],
            [new Date(2028, 1, 29, 12), "2028-02-28", "2028-03-05", "2028-02-29"],
        ] as const)("handles reset boundaries on %s", async (now, startDate, endDate, monthEnd) => {
            expect.hasAssertions();
            vi.setSystemTime(now);
            const { parser, service } = createParser();
            await invokeParserMethod(parser, "createStaticEvents");
            const events = service.addRecords.mock.calls[0][2];
            expect(events.find(event => event.title === "Echo of War")).toMatchObject({ startDate, endDate });
            expect(events.find(event => event.title === "Embers Exchange")).toMatchObject({ endDate: monthEnd });
        });
    });

    describe("Version extraction", () => {
        it.each([true, false])("selects the first released version and retains updateVersion=%s", async changed => {
            expect.hasAssertions();
            const { parser, service } = createParser();
            service.updateVersion.mockResolvedValue(changed);
            const findTable = mockHtmlPage(parser, `<table><tbody>
                <tr><th>Version</th><th>Name</th><th>Release</th></tr>
                <tr><td colspan="3">Upcoming versions</td></tr>
                <tr><td>4.1</td><td>Future Patch</td><td>February 25, 2026</td></tr>
                <tr><td>?</td><td>Unannounced</td><td>TBA</td></tr>
                <tr><td>4.0</td><td><a href="/wiki/4.0">A New Journey</a></td><td>January 14, 2026</td></tr>
                <tr><td>3.9</td><td>Older Patch</td><td>December 3, 2025</td></tr>
            </tbody></table>`);
            await invokeParserMethod(parser, "getVersionInfo", { id: "Version", url: version.url });
            expect(findTable).toHaveBeenCalledWith(expect.anything(), "h2", "Version History");
            expect(service.updateVersion).toHaveBeenCalledWith("Honkai Star Rail", version);
            expect(versionState(parser).versionInfo).toStrictEqual(version);
            expect(versionState(parser).isNewVersion).toBe(changed);
        });

        it.each([
            "",
            "<table><tbody></tbody></table>",
            "<table><tr><td>4.1</td><td>Future</td><td>February 25, 2026</td></tr></table>",
            "<table><tr><td>?</td><td>Unknown</td><td>TBA</td></tr></table>",
        ])("preserves version data when no released version is available in %j", async html => {
            expect.hasAssertions();
            const { parser, service } = createParser();
            versionState(parser).versionInfo = version;
            versionState(parser).isNewVersion = true;
            mockHtmlPage(parser, html);
            vi.spyOn(console, "warn").mockImplementation(() => null);
            await invokeParserMethod(parser, "getVersionInfo", { id: "Version", url: version.url });
            expect(service.updateVersion).not.toHaveBeenCalled();
            expect(versionState(parser).versionInfo).toStrictEqual(version);
            expect(versionState(parser).isNewVersion).toBe(true);
        });

        it("runs actual version extraction before writing static events", async () => {
            expect.hasAssertions();
            const { parser, service } = createParser([{ id: "Version", url: version.url }]);
            mockHtmlPage(parser, "<table><tr><td>4.0</td><td><a href='/wiki/4.0'>A New Journey</a></td><td>January 14, 2026</td></tr></table>");
            await invokeParserMethod(parser, "parseSourceData");
            expect(service.updateVersion).toHaveBeenCalledWith("Honkai Star Rail", version);
            expect(service.addRecords).toHaveBeenCalledTimes(1);
            expect(service.addRecords.mock.calls[0][2]).toHaveLength(5);
            expect(service.updateVersion.mock.invocationCallOrder[0]).toBeLessThan(service.addRecords.mock.invocationCallOrder[0]);
        });
    });

    describe("Events Handling", () => {
        it("extracts HTML event links and dates, classifies events and excludes indefinite entries", async () => {
            expect.hasAssertions();
            const { parser, service } = createParser();
            mockHtmlPage(parser, `<table class="wikitable"><tbody>
                <tr><th>Event</th><th>Duration</th><th>Type</th></tr>
                <tr><td><a href="/wiki/fissure">Planar Fissure</a></td><td>February 3, 2026 – February 24, 2026</td><td>temporary</td></tr>
                <tr><td><a href="https://other.example/web">Web Rewards</a></td><td>February 1, 2026 – February 8, 2026</td><td>Web Event</td></tr>
                <tr><td>Permanent</td><td>February 1, 2026 – Indefinite</td><td>Web</td></tr>
                <tr><td>Missing end</td><td>February 1, 2026</td><td>temporary</td></tr>
                <tr><td>Unknown</td><td>invalid-start – invalid-end</td><td>Web</td></tr>
            </tbody></table>`);
            await invokeParserMethod(parser, "parseEvents", { id: "Events", url: "https://example.com/events" });
            expect(service.addRecords).toHaveBeenCalledWith("Honkai Star Rail", "events", [
                { title: "Planar Fissure", url: "https://example.com/wiki/fissure", icon: "icons/honkai-star-rail/temporary.svg", startDate: "2026-02-03", endDate: "2026-02-24", eventType: EventType.Temporary, completed: false },
                { title: "Web Rewards", url: "https://other.example/web", icon: "icons/honkai-star-rail/web.svg", startDate: "2026-02-01", endDate: "2026-02-08", eventType: EventType.Web, completed: false },
                { title: "Unknown", url: "", icon: "icons/honkai-star-rail/web.svg", startDate: "", endDate: "", eventType: EventType.Web, completed: false },
            ]);
        });

        it("handles an empty event listing", async () => {
            expect.hasAssertions();
            const { parser, service } = createParser();
            mockHtmlPage(parser, "<table class='wikitable'><tr><th>Event</th></tr></table>");
            await invokeParserMethod(parser, "parseEvents", { id: "Events", url: "https://example.com/events" });
            expect(service.addRecords).toHaveBeenCalledWith("Honkai Star Rail", "events", []);
        });

        it("should parse events successfully", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Events", url: "https://example.com/events" };
            const { parser, service } = createParser([source]);

            const pageMock = {
                $$eval: vi.fn(() => [
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
                $$eval: vi.fn(() => [
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
        it.each([
            ["Anomaly Arbitration", "h2", "anomaly-arbitration"],
            ["Apocalyptic Shadow", "h2", "apocalyptic-shadow"],
            ["Pure Fiction", "h2", "pure-fiction"],
            ["Forgotten Hall", "h3", "forgotten-hall"],
        ])("extracts the last history row for %s", async (id, header, icon) => {
            expect.hasAssertions();
            const { parser, service } = createParser();
            const findTable = mockHtmlPage(parser, `<table><tbody>
                <tr><th>Season</th><th>Start</th><th>End</th></tr>
                <tr><td>Old</td><td>December 1, 2025</td><td>January 1, 2026</td></tr>
                <tr><td>Current</td><td>January 15, 2026</td><td>February 26, 2026</td></tr>
            </tbody></table>`);
            const source: DataSource = { id, url: `https://example.com/${icon}` };
            await invokeParserMethod(parser, "parseTreasuresLightward", source, header);
            expect(findTable).toHaveBeenCalledWith(expect.anything(), header, "History");
            expect(service.addRecords).toHaveBeenCalledWith("Honkai Star Rail", "events", [
                { title: id, url: source.url, icon: `icons/honkai-star-rail/${icon}.svg`, startDate: "2026-01-15", endDate: "2026-02-26", eventType: EventType.EndGame, completed: false },
            ]);
        });

        it.each([
            "<table><tbody></tbody></table>",
            "<table><tr><th>Season</th><th>Start</th><th>End</th></tr></table>",
            "<table><tr><td>Season</td><td>January 15, 2026</td></tr></table>",
            "<table><tr><td>Season</td><td></td><td>February 26, 2026</td></tr></table>",
            "<table><tr><td>Season</td><td>invalid</td><td>February 26, 2026</td></tr></table>",
            "<table><tr><td>Season</td><td>January 15, 2026</td><td>invalid</td></tr></table>",
        ])("skips incomplete or invalid history data in %j", async html => {
            expect.hasAssertions();
            const { parser, service } = createParser();
            mockHtmlPage(parser, html);
            const warn = vi.spyOn(console, "warn").mockImplementation(() => null);
            await invokeParserMethod(parser, "parseTreasuresLightward", { id: "Pure Fiction", url: "https://example.com/pure-fiction" });
            expect(service.addRecords).toHaveBeenCalledWith("Honkai Star Rail", "events", []);
            expect(warn).toHaveBeenCalled();
        });

        it.each(["GMT+8", "GMT+08", "GMT-5", "GMT-05"])("accepts timezone notation %s", async zone => {
            expect.hasAssertions();
            const { parser, service } = createParser();
            // These times stay on the same calendar dates in both UTC and New York.
            const time = zone.includes("+") ? "20:00" : "08:00";
            mockHtmlPage(parser, `<table><tr><td>Season</td><td>January 15, 2026 ${time} ${zone}</td><td>February 26, 2026 ${time} ${zone}</td></tr></table>`);
            await invokeParserMethod(parser, "parseTreasuresLightward", { id: "Pure Fiction", url: "https://example.com/pure-fiction" });
            expect(service.addRecords.mock.calls[0][2]).toEqual([
                expect.objectContaining({ startDate: "2026-01-15", endDate: "2026-02-26" }),
            ]);
        });

        it("parseTreasuresLightward parses date row successfully", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Pure Fiction", url: "https://example.com/pure-fiction" };
            const { parser, service } = createParser([source]);

            const tableElementMock = {
                evaluate: vi.fn(async () => ({
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
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => null);

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
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => null);

            const tableElementMock = {
                evaluate: vi.fn(() => ({
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
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => null);

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
