import { add, endOfISOWeek, endOfMonth, format, isValid, parseISO, startOfISOWeek, startOfMonth } from "date-fns";
import * as puppeteer from "puppeteer";

import { DATE_FORMAT } from "@shared-lib/constants";
import { EventType } from "@shared-lib/enums";
import type { DataFile, DataSource, Event, Version } from "@shared-lib/types";

import { DataService, Logger } from "../services";
import { AbstractDataParser } from "./abstract-data-parser";

export class GenshinImpactParser extends AbstractDataParser {

    // Constructor ------------------------------------------------------------
    constructor (data: DataFile, private readonly service: DataService = new DataService()) {
        super(data, service);
        this.documentID = data.id;
        this.data = data;
    }

    // Processing Controllers -------------------------------------------------

    /**
     * Parser controller for the Genshin Impact parser.  Determines what items need to be parsed,
     * and hands those tasks off to the appropriate parsing methods.
     */
    protected override async parseSourceData (): Promise<void> {
        for (const source of this.data.sourceList) {
            switch (source.id) {

                case "Version":
                    await this.getVersionInfo(source);
                    await this.createStaticEvents();
                    break;

                case "Banners":
                    await this.parseSummonBanners(source);
                    break;

                case "Events":
                    await this.parseEvents(source);
                    break;

                default:
                    Logger.warn("Unknown source ID: ", source.id);
                    break;
            }
        }
    }

    /**
     * Creates events that are static and do not require parsing.
     *
     * There events are:
     * - Daily Commissions
     * - Trounce Domain
     * - Paimon's Bargains
     * - Artifact Extraction
     * - Artifact Definition
     * - Spiral Abyss
     * - Imaginarium Theater
     */
    private async createStaticEvents (): Promise<void> {
        const staticEvents: Array<Event> = [
            {
                title: "Daily Commissions",
                url: "https://genshin-impact.fandom.com/wiki/Commission",
                icon: "icons/genshin-impact/commission.svg",
                startDate: format(new Date(), DATE_FORMAT),
                endDate: format(new Date(), DATE_FORMAT),
                eventType: EventType.Daily,
                completed: false
            },

            {
                title: "Trounce Domain",
                url: "https://genshin-impact.fandom.com/wiki/Trounce_Domain",
                icon: "icons/genshin-impact/trounce-domain.svg",
                startDate: format(startOfISOWeek(new Date()), DATE_FORMAT),
                endDate: format(endOfISOWeek(new Date()), DATE_FORMAT),
                eventType: EventType.Weekly,
                completed: false
            },

            {
                title: "Paimon's Bargains",
                url: "https://genshin-impact.fandom.com/wiki/Paimon%27s_Bargains",
                icon: "icons/genshin-impact/paimons-bargains.svg",
                startDate: format(startOfMonth(new Date()), DATE_FORMAT),
                endDate: format(endOfMonth(new Date()), DATE_FORMAT),
                eventType: EventType.Monthly,
                completed: false
            }
        ];

        staticEvents.push(...this.getMonthlyEvents(), ...this.getPatchEvents());

        await this.service.addRecords(this.documentID, "events", staticEvents);
    }

    /**
     * Events that are specific to a particular month, such as the Spiral Abyss and Imaginarium Theater.
     * These events are typically tied to the monthly schedule and may include crafting periods or special in-game activities.
     *
     * @returns An array of event objects representing the monthly events.
     */
    private getMonthlyEvents (): Array<Event> {

        // Handle events that have specific monthly schedules, such as the Spiral Abyss and Imaginarium Theater.
        const now = new Date();
        const monthStart = startOfMonth(now);
        const abyssStart = add(monthStart, { months: now.getDate() < 16 ? -1 : 0, days: 15 });
        const monthlyEvents: Array<Event> = [
            {
                title: "Spiral Abyss",
                url: "https://genshin-impact.fandom.com/wiki/Spiral_Abyss",
                icon: "icons/genshin-impact/spiral-abyss.svg",
                startDate: format(abyssStart, DATE_FORMAT),
                endDate: format(add(abyssStart, { months: 1, days: -1 }), DATE_FORMAT),
                eventType: EventType.EndGame,
                completed: false
            },

            {
                title: "Imaginarium Theater",
                url: "https://genshin-impact.fandom.com/wiki/Imaginarium_Theater",
                icon: "icons/genshin-impact/imaginarium-theater.svg",
                startDate: format(monthStart, DATE_FORMAT),
                endDate: format(endOfMonth(now), DATE_FORMAT),
                eventType: EventType.EndGame,
                completed: false
            }
        ];

        // Monthly resets are independent of the version; crafting still needs a release date.
        // Parse date-only strings locally so the crafting period cannot shift a day west of UTC.


        return monthlyEvents;
    }

    /**
     * Events that are tied to specific game patches, such as crafting periods for artifacts.
     *
     * @returns An array of event objects representing the patch-specific events.
     */
    private getPatchEvents (): Array<Event> {
        const patchEvents: Array<Event> = [];

        const releaseDate = typeof this.versionInfo.releaseDate === "string" ? parseISO(this.versionInfo.releaseDate) : this.versionInfo.releaseDate;
        if (releaseDate && isValid(releaseDate)) {
            const startDate = format(releaseDate, DATE_FORMAT);
            const endDate = format(add(releaseDate, { weeks: 6 }), DATE_FORMAT);

            patchEvents.push({
                title: "Artifact Extraction",
                url: "https://genshin-impact.fandom.com/wiki/Artifact",
                icon: "icons/genshin-impact/artifacts.svg",
                startDate,
                endDate,
                eventType: EventType.Crafting,
                completed: false
            },

            {
                title: "Artifact Definition",
                url: "https://genshin-impact.fandom.com/wiki/Artifact",
                icon: "icons/genshin-impact/artifacts.svg",
                startDate,
                endDate,
                eventType: EventType.Crafting,
                completed: false
            });
        }

        return patchEvents;
    }

    /**
     * Retrieves the version information from the specified data source and updates the internal version state.
     *
     * @param sourceData - The data source containing version information.
     */
    // eslint-disable-next-line max-lines-per-function
    private async getVersionInfo (sourceData: DataSource): Promise<void> {
        const versionInfo = await this.browserController(sourceData.url, async (page) => {

            // Get versions table ---------------------------------------------
            const versionTable = await this.getTableByHeaderText(page, "h2", "Version History");
            if (!versionTable) {
                Logger.warn("Could not find Version information.");
                return [];
            }

            // Extract version data -------------------------------------------
            const versionData = await page.evaluate((table) => {
                const rows = Array.from(table.querySelectorAll("tbody > tr"));
                const firstDataRow = rows.find((row) => {
                    const columns = row.querySelectorAll("td");

                    if (columns.length < 3) {
                        return false;
                    }

                    const releaseDate = columns[2]?.textContent?.trim() || "";
                    const parsedReleaseDate = new Date(releaseDate);

                    return !Number.isNaN(parsedReleaseDate.getTime()) && parsedReleaseDate <= new Date();
                });

                if (!firstDataRow) {
                    return null;
                }

                const columns = firstDataRow.querySelectorAll("td");
                const pathID = columns[0]?.textContent?.trim() || "";
                const patchName = columns[1]?.textContent?.trim() || "";
                const releaseDate = columns[2]?.textContent?.trim() || "";

                const href = columns[1]?.querySelector("a")?.getAttribute("href") ?? "";
                const url = href ? new URL(href, window.location.origin).toString() : "";

                return {
                    title: `${pathID}: ${patchName}`,
                    releaseDate,
                    url
                };
            }, versionTable);


            // Validate and format version data -------------------------------
            if (!versionData) {
                Logger.warn("Could not find Version row data.");
                return [];
            }

            const releaseDate = isValid(new Date(versionData.releaseDate))
                ? format(new Date(versionData.releaseDate), DATE_FORMAT)
                : "";

            return [{
                title: versionData.title,
                releaseDate,
                url: versionData.url
            }];
        });

        const version = versionInfo[0] as Version | undefined;
        if (!version?.releaseDate) {
            return;
        }
        this.versionInfo = version;
        this.isNewVersion = await this.service.updateVersion(this.documentID, version);
    }

    /**
     * Handles parsing the standard events listing of Genshin Impact.
     *
     * @param sourceData - The data source containing event information.
     */
    private async parseEvents (sourceData: DataSource): Promise<void> {
        const events = await this.browserController(sourceData.url, async (page) => {

            // Loop table rows in page context and extract raw fields
            const tableData = await page.$$eval("table.wikitable > tbody > tr:not(:has(th))", rows => rows.map((row) => {
                const columns = row.querySelectorAll("td");

                const [firstColumn] = columns;
                const rawTitle = firstColumn?.textContent?.trim() || "";
                const title = rawTitle.replace(/\b(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2})\b/g, "").trim();
                const href = firstColumn?.querySelector("a")?.getAttribute("href") ?? "";
                const url = href ? new URL(href, window.location.origin).toString() : "";

                const secondColumn = columns[1]?.textContent?.trim() || "";
                const dates = secondColumn.split("–").map(date => date.trim());
                const [startDate, endDate = ""] = dates.length === 2 ? dates : [dates[0], ""];

                const thirdColumn = columns[2]?.textContent?.trim() || "";

                return { title, url, startDate, endDate, thirdColumn };
            }));

            // Normalize types and return Event[]
            return tableData.map(row => ({
                title: row.title,
                url: row.url,
                icon: `icons/genshin-impact/${this.getEventType(row.thirdColumn, row.endDate)}.svg`,
                startDate: isValid(new Date(row.startDate)) ? format(new Date(row.startDate), DATE_FORMAT) : "",
                endDate: isValid(new Date(row.endDate)) ? format(new Date(row.endDate), DATE_FORMAT) : "",
                eventType: this.getEventType(row.thirdColumn, row.endDate),
                completed: false
            }));
        });

        // Add events to the database
        const filteredEvents = events.filter((event): event is Event => "eventType" in event && event.eventType !== EventType.Permanent);
        await this.service.addRecords(this.documentID, "events", filteredEvents);
    }

    /**
     * Parses the current summon banner information from the wish history page.
     *
     * @param sourceData - The data source containing banner information.
     */
    private async parseSummonBanners (sourceData: DataSource): Promise<void> {
        const events = await this.browserController(sourceData.url, async (page) => {

            const eventsTable = await this.getTableByHeaderText(page, "h3", "Current Event Wishes");
            if (!eventsTable) {
                Logger.warn("Could not find Banner information.");
                return [];
            }

            return await this.extractBannerEvents(page, eventsTable);
        });

        // Add events to the database
        await this.service.addRecords(this.documentID, "events", events);
    }

    /**
     * Extracts banner events from the banner table element.
     *
     * @param page        - The Puppeteer page instance.
     * @param eventsTable - The table element containing banner data.
     * @returns           Array of banner events.
     */
    // eslint-disable-next-line @stylistic/max-len
    private async extractBannerEvents (page: puppeteer.Page, eventsTable: puppeteer.ElementHandle<Element>): Promise<Array<Event>> {
        const bannerData = await page.evaluate((table) => {
            const rows = Array.from(table.querySelectorAll("tbody > tr"));
            const banners: Array<{ title: string; url: string; startDate: string; endDate: string }> = [];
            let currentDuration = "";

            for (const row of rows) {
                const headerCell = row.querySelector("th[colspan]");
                if (headerCell?.getAttribute("colspan")) {
                    const headerText = headerCell.textContent?.trim() ?? "";
                    const dateMatch = headerText.match(/(\w+ \d+, \d{4})\s*—\s*(\w+ \d+, \d{4})/);
                    if (dateMatch) {
                        currentDuration = `${dateMatch[1]}|${dateMatch[2]}`;
                    }
                    continue;
                }

                const bannerCell = row.querySelector("td:nth-child(2)");
                if (bannerCell && currentDuration) {
                    let bannerLinks = Array.from(bannerCell.querySelectorAll(".wish-banners > div a"));
                    if (bannerLinks.length === 0) { bannerLinks = Array.from(bannerCell.querySelectorAll("div a")); }
                    if (bannerLinks.length === 0) { bannerLinks = Array.from(bannerCell.querySelectorAll("a")); }

                    for (const link of bannerLinks) {
                        const bannerName = link.textContent?.trim() ?? "";
                        const bannerUrl = link.getAttribute("href") ?? "";
                        if (bannerName && bannerUrl) {
                            const [start, end] = currentDuration.split("|");
                            banners.push({
                                title: bannerName,
                                url: bannerUrl ? new URL(bannerUrl, window.location.origin).toString() : "",
                                startDate: start,
                                endDate: end
                            });
                        }
                    }
                }
            }
            return banners;
        }, eventsTable);

        return bannerData.map((banner, index) => {
            const cleanTitle = banner.title.replace(/\s*\/\s*\d{4}-\d{2}-\d{2}.*$/i, "").trim();
            return {
                title: cleanTitle,
                url: banner.url,
                icon: `icons/genshin-impact/banner-${index}.svg`,
                startDate: format(new Date(banner.startDate), DATE_FORMAT),
                endDate: format(new Date(banner.endDate), DATE_FORMAT),
                eventType: EventType.Banner,
                completed: false
            };
        });
    }
}
