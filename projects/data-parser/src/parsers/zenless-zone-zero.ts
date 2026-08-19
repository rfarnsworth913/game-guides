import { add, endOfISOWeek, endOfMonth, format, isValid, startOfISOWeek, startOfMonth } from "date-fns";
import * as puppeteer from "puppeteer";

import { formatDate, formatMonthName } from "@common/constants";
import { EventType } from "@common/enums";
import { DataFile, DataSource, Event, Version } from "@common/types";

import { DataService, getDateFromString, Logger } from "../services";
import { AbstractDataParser } from "./abstract-data-parser";

export class ZenlessZoneZeroParser extends AbstractDataParser {

    // Constructor ------------------------------------------------------------
    constructor (data: DataFile, private readonly service: DataService = new DataService()) {
        super(data, service);
        this.documentID = data.id;
        this.data = data;
    }

    // Processing Controllers -------------------------------------------------

    /**
     * Parser controller for the Zenless Zone Zero parser.  Determines what items need to be parsed,
     * and hands those tasks off to the appropriate parsing methods.
     */
    protected override async parseSourceData (): Promise<void> {
        for (const source of this.data.sourceList) {
            switch (source.id) {

                case "Version":
                    await this.getVersionInfo(source);
                    await this.createStaticEvents();
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
     * - Errands
     * - Notorious Hunt
     * - Signal Shop
     */
    private async createStaticEvents (): Promise<void> {
        const staticEvents: Array<Event> = [
            {
                title: "Errands",
                url: "https://zenless-zone-zero.fandom.com/wiki/Compendium#Errands",
                icon: "icons/zenless-zone-zero/errands.svg",
                startDate: format(new Date(), formatDate),
                endDate: format(new Date(), formatDate),
                eventType: EventType.Daily,
                completed: false
            },

            {
                title: "Notorious Hunt",
                url: "https://zenless-zone-zero.fandom.com/wiki/Notorious_Hunt",
                icon: "icons/zenless-zone-zero/notorious-hunt.svg",
                startDate: format(startOfISOWeek(new Date()), formatDate),
                endDate: format(endOfISOWeek(new Date()), formatDate),
                eventType: EventType.Weekly,
                completed: false
            },

            {
                title: "Signal Shop",
                url: "https://zenless-zone-zero.fandom.com/wiki/Signal_Shop",
                icon: "icons/zenless-zone-zero/signal-shop.svg",
                startDate: format(startOfMonth(new Date()), formatDate),
                endDate: format(endOfMonth(new Date()), formatDate),
                eventType: EventType.Monthly,
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

}
