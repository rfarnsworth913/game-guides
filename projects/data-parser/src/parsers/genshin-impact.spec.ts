import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { EventType } from '@shared-lib/enums';
import type { DataFile, DataSource, Version } from '@shared-lib/types';
import { DataService } from "../services";
import { GenshinImpactParser } from "./genshin-impact";


// Setup Parser Fixture -------------------------------------------------------
type ParserFixture = {
    parser: GenshinImpactParser;
    service: {
        addRecords: Mock<DataService["addRecords"]>;
        updateVersion: Mock<DataService["updateVersion"]>;
    };
};

type ParserMethod = | "getVersionInfo" | "parseEvents" | "createStaticEvents" | "parseSummonBanners" | "parseImaginariumTheater" | "parseSpiralAbyss" | "parseSourceData";

const createParser = (sourceList: Array<DataSource> = []): ParserFixture => {
    const dataFile: DataFile = {
        id: "Genshin Impact",
        sourceList
    };

    const service = {
        addRecords: vi.fn<DataService["addRecords"]>().mockResolvedValue(globalThis.undefined),
        updateVersion: vi.fn<DataService["updateVersion"]>().mockResolvedValue(true),
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
    return vi.spyOn(parserRecord, methodName);
};

const mockBrowserController = (parser: GenshinImpactParser, pageMock: unknown): void => {
    spyOnParserMethod(parser, "browserController")
        .mockImplementation(async (...args: Array<unknown>) => {
            const callback = args[1] as (page: unknown) => Promise<unknown>;
            return callback(pageMock);
        });
};

// jsdom has no bundled declarations; describe the DOM surface used by these fixtures.
const loadModule = createRequire(`${process.cwd()}/package.json`);
const { JSDOM } = loadModule("jsdom") as {
    JSDOM: new (html: string, options: { url: string }) => { window: Window & { close(): void } };
};
const windows: Array<Window & { close(): void }> = [];
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const version: Version = { title: "6.3: A Winter Journey", releaseDate: "2026-01-14", url: "https://example.com/wiki/6.3" };
const versionState = (parser: GenshinImpactParser) => parser as unknown as { versionInfo: Version; isNewVersion: boolean };

/** Run the actual page extraction callbacks against local HTML without Chrome or a live wiki. */
function mockHtmlPage (parser: GenshinImpactParser, html: string): void {
    const dom = new JSDOM(html, { url: "https://example.com/wiki/source" });
    windows.push(dom.window);
    Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
    mockBrowserController(parser, {
        evaluate: async (callback: (element: Element) => unknown, element: Element) => callback(element),
        $$eval: async (selector: string, callback: (elements: Array<Element>) => unknown) =>
            callback(Array.from(dom.window.document.querySelectorAll(selector))),
    });
    spyOnParserMethod(parser, "getTableByHeaderText").mockImplementation(async () => dom.window.document.querySelector("table"));
}


// Test Suite -----------------------------------------------------------------
describe("Genshin Impact Parser Unit Tests", () => {

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
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => null);

            const getVersionInfo = spyOnParserMethod(parser, "getVersionInfo").mockImplementation(() => null);
            const createStaticEvents = spyOnParserMethod(parser, "createStaticEvents").mockImplementation(() => null);
            const parseSummonBanners = spyOnParserMethod(parser, "parseSummonBanners").mockImplementation(() => null);
            const parseEvents = spyOnParserMethod(parser, "parseEvents").mockImplementation(() => null);
            const parseImaginariumTheater = spyOnParserMethod(parser, "parseImaginariumTheater").mockImplementation(() => null);
            const parseSpiralAbyss = spyOnParserMethod(parser, "parseSpiralAbyss").mockImplementation(() => null);

            await invokeParserMethod(parser, "parseSourceData");

            expect(getVersionInfo).toHaveBeenCalledWith(sources[0]);
            expect(createStaticEvents).toHaveBeenCalledTimes(2);
            expect(createStaticEvents.mock.invocationCallOrder[0]).toBeLessThan(getVersionInfo.mock.invocationCallOrder[0]);
            expect(createStaticEvents.mock.invocationCallOrder[1]).toBeGreaterThan(getVersionInfo.mock.invocationCallOrder[0]);
            expect(createStaticEvents.mock.invocationCallOrder[1]).toBeLessThan(parseSummonBanners.mock.invocationCallOrder[0]);
            expect(parseSummonBanners).toHaveBeenCalledWith(sources[1]);
            expect(parseEvents).toHaveBeenCalledWith(sources[2]);
            expect(parseImaginariumTheater).toHaveBeenCalledWith(sources[3]);
            expect(parseSpiralAbyss).toHaveBeenCalledWith(sources[4]);
            expect(warnSpy).toHaveBeenCalled();
        });
    });

    describe("Static events and version extraction", () => {
        it("writes calendar resets and the six-week crafting period", async () => {
            expect.hasAssertions();
            const { parser, service } = createParser();
            versionState(parser).versionInfo = version;
            await invokeParserMethod(parser, "createStaticEvents");
            const events = service.addRecords.mock.calls[0][2];
            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", events);
            expect(events).toHaveLength(5);
            expect(events).toEqual(expect.arrayContaining([
                expect.objectContaining({ title: "Daily Commissions", startDate: "2026-01-21", endDate: "2026-01-21", eventType: EventType.Daily }),
                expect.objectContaining({ title: "Trounce Domain", startDate: "2026-01-19", endDate: "2026-01-25", eventType: EventType.Weekly }),
                expect.objectContaining({ title: "Paimon's Bargains", startDate: "2026-01-01", endDate: "2026-01-31", eventType: EventType.Monthly }),
                expect.objectContaining({ title: "Artifact Extraction", startDate: "2026-01-14", endDate: "2026-02-25", eventType: EventType.Crafting }),
                expect.objectContaining({ title: "Artifact Definition", startDate: "2026-01-14", endDate: "2026-02-25", eventType: EventType.Crafting }),
            ]));
            expect(events.every(event => "completed" in event && event.completed === false)).toBe(true);
        });

        it.each(["", "invalid-date", null])("keeps calendar events usable with release date %j", async releaseDate => {
            expect.hasAssertions();
            const { parser, service } = createParser();
            versionState(parser).versionInfo = { ...version, releaseDate };
            await invokeParserMethod(parser, "createStaticEvents");
            expect(service.addRecords.mock.calls[0][2].map(event => event.title)).toStrictEqual([
                "Daily Commissions", "Trounce Domain", "Paimon's Bargains",
            ]);
        });

        it("handles calendar resets across a year boundary", async () => {
            expect.hasAssertions();
            vi.setSystemTime(new Date(2026, 11, 31, 12));
            const { parser, service } = createParser();
            versionState(parser).versionInfo = version;
            await invokeParserMethod(parser, "createStaticEvents");
            expect(service.addRecords.mock.calls[0][2]).toEqual(expect.arrayContaining([
                expect.objectContaining({ title: "Trounce Domain", startDate: "2026-12-28", endDate: "2027-01-03" }),
                expect.objectContaining({ title: "Paimon's Bargains", startDate: "2026-12-01", endDate: "2026-12-31" }),
            ]));
        });

        it.each([true, false])("skips unreleased rows and retains the version-change result %s", async changed => {
            expect.hasAssertions();
            const { parser, service } = createParser();
            service.updateVersion.mockResolvedValue(changed);
            mockHtmlPage(parser, `<table><tbody>
                <tr><th>Version</th><th>Name</th><th>Release</th></tr>
                <tr><td colspan="3">Upcoming</td></tr>
                <tr><td>6.4</td><td>Future</td><td>February 25, 2026</td></tr>
                <tr><td>?</td><td>Unannounced</td><td>TBA</td></tr>
                <tr><td>6.3</td><td><a href="/wiki/6.3">A Winter Journey</a></td><td>January 14, 2026</td></tr>
                <tr><td>6.2</td><td>Older</td><td>December 3, 2025</td></tr>
            </tbody></table>`);
            await invokeParserMethod(parser, "getVersionInfo", { id: "Version", url: version.url });
            expect(service.updateVersion).toHaveBeenCalledWith("Genshin Impact", version);
            expect(versionState(parser).versionInfo).toStrictEqual(version);
            expect(versionState(parser).isNewVersion).toBe(changed);
        });

        it.each(["", "<table><tr><td>7.0</td><td>Future</td><td>January 1, 2027</td></tr></table>"])("preserves the known version when no released row exists in %j", async html => {
            expect.hasAssertions();
            const { parser, service } = createParser();
            versionState(parser).versionInfo = version;
            mockHtmlPage(parser, html);
            vi.spyOn(console, "warn").mockImplementation(() => null);
            await invokeParserMethod(parser, "getVersionInfo", { id: "Version", url: version.url });
            expect(service.updateVersion).not.toHaveBeenCalled();
            expect(versionState(parser).versionInfo).toStrictEqual(version);
        });

        it("starts with calendar events and adds crafting events after loading a version", async () => {
            expect.hasAssertions();
            const { parser, service } = createParser([{ id: "Version", url: version.url }]);
            mockHtmlPage(parser, `<table><tbody><tr><td>6.3</td><td><a href="/wiki/6.3">A Winter Journey</a></td><td>January 14, 2026</td></tr></tbody></table>`);
            await invokeParserMethod(parser, "parseSourceData");
            expect(service.addRecords).toHaveBeenCalledTimes(2);
            expect(service.addRecords.mock.calls[0][2]).toHaveLength(3);
            expect(service.addRecords.mock.calls[1][2]).toHaveLength(5);
            expect(service.updateVersion).toHaveBeenCalledWith("Genshin Impact", version);
        });
    });

    describe("Events Handling", () => {
        it("extracts HTML titles, links and date ranges while excluding permanent events", async () => {
            expect.hasAssertions();
            const { parser, service } = createParser();
            mockHtmlPage(parser, `<table class="wikitable"><tbody>
                <tr><th>Event</th><th>Duration</th><th>Type</th></tr>
                <tr><td><a href="/wiki/lantern">Lantern Rite January 10, 2026</a></td><td>January 10, 2026 – January 20, 2026</td><td>Web Event</td></tr>
                <tr><td><a href="https://other.example/pass">Battle Pass 2026-01-10</a></td><td>January 10, 2026 – February 20, 2026</td><td>Battle Pass</td></tr>
                <tr><td>Permanent</td><td>January 1, 2026</td><td>Web</td></tr>
                <tr><td>Indefinite</td><td>January 1, 2026 – Indefinite</td><td>Web</td></tr>
            </tbody></table>`);
            await invokeParserMethod(parser, "parseEvents", { id: "Events", url: version.url });
            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", [
                { title: "Lantern Rite", url: "https://example.com/wiki/lantern", icon: "icons/genshin-impact/web.svg", startDate: "2026-01-10", endDate: "2026-01-20", eventType: EventType.Web, completed: false },
                { title: "Battle Pass", url: "https://other.example/pass", icon: "icons/genshin-impact/battle-pass.svg", startDate: "2026-01-10", endDate: "2026-02-20", eventType: EventType.BattlePass, completed: false },
            ]);
        });

        it("accepts an empty event listing", async () => {
            expect.hasAssertions();
            const { parser, service } = createParser();
            mockHtmlPage(parser, "<table class='wikitable'><tr><th>Event</th></tr></table>");
            await invokeParserMethod(parser, "parseEvents", { id: "Events", url: version.url });
            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", []);
        });
        it("should parse event data successfully", async () => {
            expect.hasAssertions();

            const source: DataSource = { id: "Events", url: "https://example.com/events" };
            const { parser, service } = createParser([source]);

            const pageMock = {
                $$eval: vi.fn(() => [
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
                $$eval: vi.fn(() => [
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
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => null);

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
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => null);

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getElementByText").mockImplementation(() => null);

            await invokeParserMethod(parser, "parseSpiralAbyss", source);

            expect(warnSpy).toHaveBeenCalled();
            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", []);
        });
    });

    describe("Summoning Banners Handling", () => {
        it("extracts banner links with fallback layouts and separate duration headers", async () => {
            expect.hasAssertions();
            const { parser, service } = createParser();
            mockHtmlPage(parser, `<table><tbody>
                <tr><td>No duration</td><td><a href="/ignore">Ignore</a></td></tr>
                <tr><th colspan="2">January 10, 2026 — January 31, 2026</th></tr>
                <tr><td>Phase I</td><td><div class="wish-banners"><div><a href="/wiki/wish">Winter Wish / 2026-01-10</a><a href="">No destination</a><a href="/empty"> </a></div></div></td></tr>
                <tr><td>Weapon</td><td><div><a href="https://other.example/weapon">Epitome Invocation</a></div></td></tr>
                <tr><th colspan="2">February 1, 2026 — February 20, 2026</th></tr>
                <tr><td>Phase II</td><td><a href="/wiki/next">Next Wish</a></td></tr>
            </tbody></table>`);
            await invokeParserMethod(parser, "parseSummonBanners", { id: "Banners", url: version.url });
            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", [
                { title: "Winter Wish", url: "https://example.com/wiki/wish", icon: "icons/genshin-impact/banner-0.svg", startDate: "2026-01-10", endDate: "2026-01-31", eventType: EventType.Banner, completed: false },
                { title: "Epitome Invocation", url: "https://other.example/weapon", icon: "icons/genshin-impact/banner-1.svg", startDate: "2026-01-10", endDate: "2026-01-31", eventType: EventType.Banner, completed: false },
                { title: "Next Wish", url: "https://example.com/wiki/next", icon: "icons/genshin-impact/banner-2.svg", startDate: "2026-02-01", endDate: "2026-02-20", eventType: EventType.Banner, completed: false },
            ]);
        });

        it("skips banners when the duration header is absent", async () => {
            expect.hasAssertions();
            const { parser, service } = createParser();
            mockHtmlPage(parser, "<table><tr><td>Missing duration</td><td><a href='/banner'>Wish</a></td></tr></table>");
            await invokeParserMethod(parser, "parseSummonBanners", { id: "Banners", url: version.url });
            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", []);
        });

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
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => null);

            mockBrowserController(parser, {});
            spyOnParserMethod(parser, "getTableByHeaderText").mockImplementation(() => null);

            await invokeParserMethod(parser, "parseSummonBanners", source);

            expect(warnSpy).toHaveBeenCalled();
            expect(service.addRecords).toHaveBeenCalledWith("Genshin Impact", "events", []);
        });
    });
});
