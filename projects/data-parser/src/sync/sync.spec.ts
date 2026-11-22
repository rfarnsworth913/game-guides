import { describe, expect, it, vi } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { GAME_PROFILES } from "./game-profiles";
import { addCalendarMonths, recurringEvents } from "./recurring-events";
import { datesIn, extractEvents, extractFgoEvents, extractGf2Banners, extractNoticeEvents, extractVersion } from "./extract";
import { GameSync } from "./game-sync";
import { parseOptions } from "./runner";
import type { Cell, SourcePage } from "./types";
import type { DataFile } from "@shared-lib/types";

const now = new Date("2026-11-21T18:00:00Z");
const cell = (text: string, url = ""): Cell => ({ text, links: url ? [{ text, title: text, url }] : [] });
const page = (headers: Array<string>, rows: Array<Array<Cell>>, heading = "Events"): SourcePage => ({
    url: "https://example.com/events", title: heading, text: "", links: [], tables: [{ heading, headers, rows }],
});
const versions = page(["Version", "Release Date"], [
    [cell("Future", "https://example.com/future"), cell("December 1, 2026")],
    [cell("Current", "https://example.com/current"), cell("November 11, 2026")],
    [cell("Previous"), cell("September 30, 2026")],
], "Version History");

describe("server calendar recurrence", () => {
    it.each(GAME_PROFILES)("generates unique occurrences for $name", profile => {
        const events = recurringEvents(profile, now);
        expect(events.length).toBeGreaterThan(60);
        expect(new Set(events.map(event => JSON.stringify([event.title, event.startDate, event.endDate]))).size).toBe(events.length);
        expect(events.every(event => String(event.endDate) >= String(event.startDate))).toBe(true);
    });
    it("clamps month ends and supports leap years", () => {
        expect(addCalendarMonths(new Date("2028-01-31T00:00:00Z"), 1).toISOString()).toBe("2028-02-29T00:00:00.000Z");
        expect(addCalendarMonths(new Date("2026-12-31T00:00:00Z"), 2).toISOString()).toBe("2027-02-28T00:00:00.000Z");
    });
    it("generates the current cycle and two calendar months independently of versions", () => {
        const events = recurringEvents(GAME_PROFILES.find(profile => profile.id === "genshin")!, now);
        const abyss = events.filter(event => event.title === "Spiral Abyss");
        expect(abyss.map(event => [event.startDate, event.endDate])).toEqual([
            ["2026-11-16", "2026-12-15"], ["2026-12-16", "2027-01-15"], ["2027-01-16", "2027-02-15"],
        ]);
        expect(events.filter(event => event.title === "Daily Commissions")).toHaveLength(61);
        expect(events.find(event => event.title === "Trounce Domain")?.startDate).toBe("2026-11-16");
        expect(events.every(event => !("completed" in event))).toBe(true);
        expect(recurringEvents(GAME_PROFILES[2], now)).toEqual(events);
    });
    it("uses the previous server day before reset without depending on host timezone", () => {
        const daily = recurringEvents(GAME_PROFILES[2], new Date("2026-11-23T08:59:00Z")).find(event => event.title === "Daily Commissions");
        expect(daily?.startDate).toBe("2026-11-22");
        const after = recurringEvents(GAME_PROFILES[2], new Date("2026-11-23T09:00:00Z")).find(event => event.title === "Daily Commissions");
        expect(after?.startDate).toBe("2026-11-23");
    });
    it("includes the active monthly cycle when its reset is later this month", () => {
        expect(recurringEvents(GAME_PROFILES[2], new Date("2026-11-01T18:00:00Z")).find(event => event.title === "Spiral Abyss")?.startDate).toBe("2026-10-16");
    });
    it.each([0, -1, 13, 1.5])("rejects invalid horizons %s", (months) => {
        expect(() => recurringEvents(GAME_PROFILES[0], now, months)).toThrow();
    });
});

describe("dated source extraction", () => {
    it("reads FGO's current duration cards instead of declaring an empty historical table successful", () => {
        const source = {...page(["Event", "Date"], []), sections: [
            {heading: "Current campaign (US)", text: "Duration: November 20, 2026 ~ December 3, 2026 PST", links: [{text: "Current campaign", title: "Current campaign", url: "https://example.com/campaign"}]},
            {heading: "Expired campaign (US)", text: "Duration: June 12, 2026 ~ July 2, 2026 PDT", links: []},
            {heading: "Upcoming", text: "ETA December 2026", links: []},
        ]};
        const result = extractFgoEvents(source, now);
        expect(result.events).toEqual([{title: "Current campaign (US)", url: "https://example.com/campaign", startDate: "2026-11-20", endDate: "2026-12-03", eventType: "temporary"}]);
        expect(result.recognizedTables).toBe(2);
        expect(extractFgoEvents(page(["Date"], []), now).recognizedTables).toBe(0);
    });
    it("reads the EN banner text cards without importing CN banners", () => {
        const source = {...page([], []), text: "CN\n2026/11/01 ~ 2026/12/01\nDolls: CN Character, Other\nEN\n2025\nNov 5 - Dec 2\nDolls: Old Character, Other\n2026\nNov 5, 09:00 - Dec 2, 16:59\nDolls: EN Character, Other\n2026/10/01 ~ 2026/10/20\nDolls: Expired, Other"};
        const result = extractGf2Banners(source, now);
        expect(result.undated).toBe(0);
        expect(result.events).toEqual([{title: "EN Character Procurement", startDate: "2026-11-05", endDate: "2026-12-02", eventType: "banner", url: source.url}]);
    });
    it.each([
        ["November 1–12, 2026", ["2026-11-01", "2026-11-12"]],
        ["2026-11-01 10:00 – 2026-12-02 09:59", ["2026-11-01", "2026-12-02"]],
        ["30 November 2026 – 4 December 2026", ["2026-11-30", "2026-12-04"]],
        ["December 30, 2026 – January 3, 2027", ["2026-12-30", "2027-01-03"]],
        ["December 30 – January 3, 2027", ["2026-12-30", "2027-01-03"]],
        ["November 21, 2026 – November 21, 2026", ["2026-11-21", "2026-11-21"]],
        ["February 30, 2026", []],
        ["Coming soon", []],
        ["2025/5/1 9:00 ~ 2025/5/2118:59(UTC-4)", ["2025-05-01", "2025-05-21"]],
        ["Endstate Matrix StagesNovember 12, 2026 - December 22, 2026", ["2026-11-12", "2026-12-22"]],
    ])("parses %s without inventing unknown dates", (text, expected) => {
        expect(datesIn(text, 2026)).toEqual(expected);
    });
    it("chooses latest released version rather than a future first row", () => {
        expect(extractVersion(versions, now)).toEqual({ title: "Current", releaseDate: "2026-11-11", url: "https://example.com/current" });
        expect(() => extractVersion(page([], []), now)).toThrow("No released version");
    });
    it("uses the visible patch name rather than a wiki route title", () => {
        const name = cell("A New Journey", "https://example.com/wiki/Version/7.2");
        name.links[0].title = "Version/7.2";
        expect(extractVersion(page(["Version", "Name", "Release Date"], [[cell("7.2"), name, cell("2026-11-04")]], "Version History"), now).title)
            .toBe("7.2: A New Journey");
    });
    it("excludes version-release tables from dynamic events", () => {
        expect(extractEvents(page(["Event", "Release Date"], [[cell("Patch 7.2"), cell("2026-11-04 – 2026-12-15")]], "Version"), "Events", now).events).toEqual([]);
    });
    it("keeps global schedules, skips expired and other-server rows and diagnoses missing dates", () => {
        const result = extractEvents(page(["Title", "Period", "Server"], [
            [cell("Global", "https://example.com/global"), cell("2026-11-20 – 2026-12-02"), cell("EN")],
            [cell("CN"), cell("2026-11-20 – 2026-12-02"), cell("CN")],
            [cell("Expired"), cell("2026-10-01 – 2026-10-12"), cell("EN")],
            [cell("Unannounced"), cell("TBA"), cell("EN")],
        ]), "Events", now);
        expect(result.events.map(event => event.title)).toEqual(["Global"]);
        expect(result.undated).toBe(1);
        expect(result.recognizedTables).toBe(1);
    });
    it("does not mistake a non-schedule for a successful empty import", () => {
        expect(extractEvents(page(["Name", "Reward"], []), "Events", now).recognizedTables).toBe(0);
    });
    it("ignores navigation headings containing date substrings and non-date period captions", () => {
        const source = page(["Game Updates", "Characters"], [[cell("Story"), cell("Dolls List")]]);
        source.tables[0].periods = ["Events in 2026"];
        expect(extractEvents(source, "Events", now)).toMatchObject({events: [], undated: 0, recognizedTables: 0});
    });
    it("does not require artificial end dates for permanent activities", () => {
        const source = page(["Event", "Duration"], [[cell("Permanent mode"), cell("April 26, 2023")]], "Permanent");
        expect(extractEvents(source, "Events", now)).toMatchObject({events: [], undated: 0, recognizedTables: 0});
    });
    it("classifies summoning and endgame separately", () => {
        const source = page(["Name", "Duration"], [[cell("A cycle"), cell("2026-11-01 – 2026-12-01")]]);
        expect(extractEvents(source, "Banners", now).events[0].eventType).toBe("banner");
        expect(extractEvents(source, "Pure Fiction", now).events[0].eventType).toBe("end-game");
    });
    it('prefers current endgame rotations over overlapping historical version windows and ignores maintenance links', () => {
        const source = page(['Duration', 'Effect'], [[cell('November 2, 2026 - December 14, 2026', 'https://example.com/events?action=purge'), cell('Current buff')]], 'Memory of Chaos');
        source.tables.push({ heading: 'History', headers: ['Cycle', 'Start', 'End'], rows: [[cell('4.6'), cell('September 28, 2026'), cell('December 14, 2026')]] });
        const result = extractEvents(source, 'Forgotten Hall', now);
        expect(result.events).toEqual([{title: 'Forgotten Hall', startDate: '2026-11-02', endDate: '2026-12-14', url: source.url, eventType: 'end-game'}]);
    });
    it.each([
        ["Stygian Onslaught", "end-game"],
        ["Heated Battle Mode", "tcg"],
        ["The Forge Realm's Temper", "tcg"],
        ["Miliastra Pass", "battle-pass"],
        ["Glittering Starwish", "temporary"],
    ])("classifies %s using its activity type", (title, expected) => {
        expect(extractEvents(page(["Name", "Duration"], [[cell(title), cell("2026-11-04 – 2026-12-15")]]), "Events", now).events[0].eventType).toBe(expected);
    });
    it("reads official duration blocks while excluding maintenance", () => {
        const result = extractNoticeEvents("● Maintenance Period: Nov 11, 2026, 06:00 – 11:00\n● New Event: City Lights\nEvent Duration: Nov 20 – Dec 2, 2026\n● Mystery\nEvent Duration: TBA", "https://example.com/notice", now, now);
        expect(result.events).toHaveLength(1);
        expect(result.events[0].title).toBe("New Event: City Lights");
        expect(result.undated).toBe(1);
    });
    it("uses contest submission windows and ignores maintenance-only notices", () => {
        const contest = extractNoticeEvents("Fan Creation Contest\n[Event Duration]\nSubmission: November 5, 2026 – December 13, 2026\nJudging: December 14 – December 30, 2026", "https://example.com/contest", now, now);
        expect(contest.events[0]).toMatchObject({endDate: "2026-12-13", eventType: "web"});
        const maintenance = extractNoticeEvents("Server Maintenance Notice: October 21\n● Duration: October 21, 2026, 06:00 – 11:00", "https://example.com/maintenance", now, now);
        expect(maintenance.undated).toBe(0);
        expect(maintenance.events).toEqual([]);
    });
});

describe("weekly synchronization", () => {
    const config: DataFile = { id: "Genshin Impact", sourceList: [{ id: "Version", url: "https://example.com/version" }, { id: "Events", url: "https://example.com/events" }] };
    const events = page(["Event", "Duration"], [[cell("A festival"), cell("2026-11-20 – 2026-12-02")]]);
    it("previews complete event payloads without creating a database service", async () => {
        const read = vi.fn(async (url: string) => url.endsWith('/version') ? versions : events);
        const report = await new GameSync(GAME_PROFILES[2], config, { read, json: vi.fn() }).run(now);
        expect(report.status).toBe("ok");
        expect(report.dynamic).toBe(1);
        expect(report.events?.find(event => event.title === "A festival")?.endDate).toBe("2026-12-02");
        expect(report.version?.title).toBe("Current");
    });
    it("continues other sources after a failure and never clears stored records", async () => {
        const service = { updateVersion: vi.fn(async () => false), addRecords: vi.fn(async () => {}), disconnect: vi.fn(async () => {}) };
        const report = await new GameSync(GAME_PROFILES[2], config, {
            read: async (url) => { if (url.endsWith("/version")) { throw new Error("HTTP 403"); } return events; }, json: vi.fn(), service,
        }).run(now);
        expect(report.status).toBe("failed");
        expect(report.sources.map(source => source.status)).toEqual(["failed", "ok"]);
        expect(service.updateVersion).not.toHaveBeenCalled();
        expect(service.addRecords).toHaveBeenCalledOnce();
        expect(report.recurring).toBeGreaterThan(60);
    });
    it("deduplicates duplicate source records and marks partial extraction as incomplete", async () => {
        const source = page(["Event", "Duration"], [...events.tables[0].rows, ...events.tables[0].rows, [cell("Unknown"), cell("TBA")]]);
        const report = await new GameSync(GAME_PROFILES[2], config, { read: async url => url.endsWith('/version') ? versions : source, json: vi.fn() }).run(now);
        expect(report.status).toBe("failed");
        expect(report.dynamic).toBe(1);
        expect(report.errors[0]).toContain("1 undated");
    });
    it("has exactly one profile for every config, excludes FFXIV and requires version sources", async () => {
        const folder = new URL("../../config/", import.meta.url);
        const files = (await readdir(folder)).filter(name => name.endsWith(".json"));
        const configs = await Promise.all(files.map(async name => JSON.parse(await readFile(new URL(name, folder), "utf8")) as DataFile));
        expect(configs.map(item => item.id).sort()).toEqual(GAME_PROFILES.map(profile => profile.name).sort());
        expect(configs.every(item => item.sourceList.some(source => source.id === "Version"))).toBe(true);
        expect(GAME_PROFILES).toHaveLength(8);
    });
    it("validates CLI game selection, horizon and unknown flags", () => {
        expect(parseOptions([]).browser).toBe("chrome");
        expect(parseOptions(["--browser=chromium"]).browser).toBe("chromium");
        expect(() => parseOptions(["--browser=invalid"])).toThrow("--browser");
        expect(parseOptions(["--dry-run", "--game=genshin,hsr", "--months", "2", "--at=2026-11-21"]).games).toEqual(["genshin", "hsr"]);
        expect(() => parseOptions(["--game=ffxiv"])).toThrow("excluded");
        expect(() => parseOptions(["--months=0"])).toThrow();
        expect(() => parseOptions(["--wrong"])).toThrow();
        expect(() => parseOptions(["--game"])).toThrow();
    });
    it("allows a persistent browser mode and explicit CLI overrides", () => {
        vi.stubEnv("PARSER_HEADLESS", "false");
        try {
            expect(parseOptions([]).headless).toBe(false);
            expect(parseOptions(["--headless"]).headless).toBe(true);
            vi.stubEnv("PARSER_HEADLESS", "true");
            expect(parseOptions(["--headed"]).headless).toBe(false);
            vi.stubEnv("PARSER_HEADLESS", "invalid");
            expect(() => parseOptions([])).toThrow("PARSER_HEADLESS");
        } finally {vi.unstubAllEnvs();}
    });
    it("uses released App Store metadata and rejects incomplete results", async () => {
        const config: DataFile = {id: "Fate Grand Order", sourceList: [{id: "Version", url: "https://itunes.apple.com/lookup?id=1183802626"}]};
        const json = vi.fn().mockResolvedValue({results: [{version: "2.95.0", currentVersionReleaseDate: "2026-11-11T00:00:00Z", trackViewUrl: "https://apps.apple.com/app/1183802626"}]});
        const report = await new GameSync(GAME_PROFILES[1], config, {read: vi.fn(), json}).run(now);
        expect(report.version?.title).toBe("2.95.0");
        expect(report.status).toBe("ok");
        json.mockResolvedValue({results: []});
        const failed = await new GameSync(GAME_PROFILES[1], config, {read: vi.fn(), json}).run(now);
        expect(failed.status).toBe("failed");
        expect(failed.version).toBeUndefined();
    });
    it("uses the latest published publisher update and excludes future Steam announcements", async () => {
        const config: DataFile = {id: "Girls Frontline 2", sourceList: [{id: "Version", url: "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=3347400"}]};
        const json = vi.fn().mockResolvedValue({appnews: {newsitems: [
            {title: "Update Contents 12/11", date: Date.parse("2026-12-11") / 1000, url: "https://example.com/future"},
            {title: "Update Contents 11/11", date: Date.parse("2026-11-11") / 1000, url: "https://example.com/current"},
        ]}});
        const report = await new GameSync(GAME_PROFILES[3], config, {read: vi.fn(), json}).run(now);
        expect(report.version?.title).toBe("Update Contents 11/11");
        expect(report.status).toBe("ok");
    });
    it("extracts NTE patch dates, events and summoning windows from linked official notices", async () => {
        const url = "https://nte.perfectworld.com/en/article/news/gamenews/20261109/1.html";
        const index: SourcePage = {...page([], []), links: [
            {url, title: "Version 1.5", text: "Version 1.5"},
            {url: "https://nte.perfectworld.com/en/article/news/gamenews/index1.html", title: "Next", text: "Next"},
            {url: "https://example.com/en/article/news/gamenews/20261109/1.html", title: "External", text: "External"},
        ]};
        const notice: SourcePage = {...page([], []), url, title: "Version 1.5 Patch Notes-NTE (Neverness to Everness)",
            text: "NTE will undergo maintenance on Nov 11, 2026.\n● New Limited S-Class Character: Test\nAvailability: Nov 11 – Dec 2\n● City Race\nEvent Duration: Nov 20 – Dec 3"};
        const report = await new GameSync(GAME_PROFILES[5], {id: "Neverness to Everness", sourceList: [{id: "Version", url: "https://nte.perfectworld.com/en/article/news/gamenews/index.html"}]}, {
            read: vi.fn(async (address: string) => address === url ? notice : index), json: vi.fn(),
        }).run(now);
        expect(report.status).toBe("ok");
        expect(report.version).toEqual({title: "Version 1.5 Patch Notes", releaseDate: "2026-11-11", url});
        expect(report.dynamic).toBe(2);
        expect(report.events?.find(event => event.title.includes("S-Class"))?.eventType).toBe("banner");
    });
});
