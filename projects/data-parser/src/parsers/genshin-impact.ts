import { add, endOfISOWeek, endOfMonth, format, isValid, startOfISOWeek, startOfMonth } from "date-fns";
import * as puppeteer from "puppeteer";

import { formatDate, formatMonthName } from "@common/constants";
import { EventType } from "@common/enums";
import { DataFile, DataSource, Event, Version } from "@common/types";

import { DataService, getDateFromString, Logger } from "../services";
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
        await this.getVersionInfo(this.data.sourceList.find(source => source.id === "Version")!);
        await this.createStaticEvents();

        for (const source of this.data.sourceList) {
            switch (source.id) {

                case "Banners":
                    await this.parseSummonBanners(source);
                    break;

                case "Events":
                    await this.parseEvents(source);
                    break;

                case "Imaginarium Theater":
                    await this.parseImaginariumTheater(source);
                    break;

                case "Spiral Abyss":
                    await this.parseSpiralAbyss(source);
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
     */
    private async createStaticEvents (): Promise<void> {
        const staticEvents: Array<Event> = [
            {
                title: "Daily Commissions",
                url: "https://genshin-impact.fandom.com/wiki/Commission",
                icon: "icons/genshin-impact/commission.svg",
                startDate: format(new Date(), formatDate),
                endDate: format(new Date(), formatDate),
                eventType: EventType.Daily,
                completed: false
            },

            {
                title: "Trounce Domain",
                url: "https://genshin-impact.fandom.com/wiki/Trounce_Domain",
                icon: "icons/genshin-impact/trounce-domain.svg",
                startDate: format(startOfISOWeek(new Date()), formatDate),
                endDate: format(endOfISOWeek(new Date()), formatDate),
                eventType: EventType.Weekly,
                completed: false
            },

            {
                title: "Paimon's Bargains",
                url: "https://genshin-impact.fandom.com/wiki/Paimon%27s_Bargains",
                icon: "icons/genshin-impact/paimons-bargains.svg",
                startDate: format(startOfMonth(new Date()), formatDate),
                endDate: format(endOfMonth(new Date()), formatDate),
                eventType: EventType.Monthly,
                completed: false
            },

            {
                title: "Artifact Extraction",
                url: "https://genshin-impact.fandom.com/wiki/Artifact",
                icon: "icons/genshin-impact/artifacts.svg",
                startDate: format(this.versionInfo.releaseDate as string, formatDate),
                endDate: format(add(this.versionInfo.releaseDate as string, { weeks: 6 }), formatDate),
                eventType: EventType.Crafting,
                completed: false
            },

            {
                title: "Artifact Definition",
                url: "https://genshin-impact.fandom.com/wiki/Artifact",
                icon: "icons/genshin-impact/artifacts.svg",
                startDate: format(this.versionInfo.releaseDate as string, formatDate),
                endDate: format(add(this.versionInfo.releaseDate as string, { weeks: 6 }), formatDate),
                eventType: EventType.Crafting,
                completed: false
            }
        ];

        await this.service.addRecords(this.documentID, "events", staticEvents);
    }

    /**
     * Retrieves the version information from the specified data source and updates the internal version state.
     *
     * @param sourceData - The data source containing version information.
     */
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
                ? format(new Date(versionData.releaseDate), formatDate)
                : "";

            return [{
                title: versionData.title,
                releaseDate,
                url: versionData.url
            } as Version];
        });

        this.versionInfo = versionInfo[0] as Version;
        this.isNewVersion = await this.service.updateVersion(this.documentID, versionInfo[0] as Version);
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
                startDate: isValid(new Date(row.startDate)) ? format(new Date(row.startDate), formatDate) : "",
                endDate: isValid(new Date(row.endDate)) ? format(new Date(row.endDate), formatDate) : "",
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
                startDate: format(new Date(banner.startDate), formatDate),
                endDate: format(new Date(banner.endDate), formatDate),
                eventType: EventType.Banner,
                completed: false
            } as Event;
        });
    }

    /**
     * Parses the current Imaginarium Theater season dates.
     *
     * @param sourceData - The data source containing Imaginarium Theater information.
     */
    private async parseImaginariumTheater (sourceData: DataSource): Promise<void> {
        const events = await this.browserController(sourceData.url, async (page) => {

            // Extract date string from the page: Season ## January 16, 2026 (Patch Name) – February 16, 2026 (Patch Name)
            const monthName = format(new Date(), formatMonthName);
            const dateString = await this.getElementByText(page, "td", monthName, "includes");
            if (!dateString) {
                Logger.warn("Could not find Imaginarium Theater duration information.");
                return [];
            }

            // Extract inner text from the matched element to avoid hidden/extra content
            const durationText = await this.getTextContent(dateString);

            const [rawStartDate = "", rawEndDate = ""] = durationText.split("–");
            const cleanedStartDate = getDateFromString(rawStartDate.replace(/^Season [0-9]+/, "").trim());
            const cleanedEndDate = getDateFromString(rawEndDate.trim());

            const startDate = format(cleanedStartDate, formatDate);
            const endDate = format(cleanedEndDate, formatDate);

            return [{
                title: "Imaginarium Theater",
                url: sourceData.url,
                icon: "icons/genshin-impact/imaginarium-theater.svg",
                startDate,
                endDate,
                eventType: EventType.EndGame,
                completed: false
            }];
        });

        // Add events to the database
        await this.service.addRecords(this.documentID, "events", events);
    }

    /**
     * Gets the current Spiral Abyss reset timer.
     *
     * @param sourceData - The data source containing Spiral Abyss information.
     */
    private async parseSpiralAbyss (sourceData: DataSource): Promise<void> {
        const events = await this.browserController(sourceData.url, async (page) => {

            // Extract date string from the page: Duration: January 16, 2026 04:00:00 AM – February 16, 2026 03:59:59 AM
            const dateString = await this.getElementByText(page, "p", "^Duration", "includes");
            if (!dateString) {
                Logger.warn("Could not find Spiral Abyss duration information.");
                return [];
            }

            // Extract inner text from the matched element to avoid hidden/extra content
            const durationText = await this.getTextContent(dateString);
            const startDate = format(durationText.split("–")[0].replace("Duration:", "").trim(), formatDate);
            const endDate = format(durationText.split("–")[1].trim(), formatDate);

            return [{
                title: "Spiral Abyss",
                url: sourceData.url,
                icon: "icons/genshin-impact/spiral-abyss.svg",
                startDate,
                endDate,
                eventType: EventType.EndGame,
                completed: false
            }];
        });

        // Add events to the database
        await this.service.addRecords(this.documentID, "events", events);
    }
}
