import { endOfISOWeek, endOfMonth, format, isValid, startOfISOWeek, startOfMonth, sub } from "date-fns";

import { formatDate } from "@common/constants";
import { EventType } from "@common/enums";
import { DataFile, DataSource, Event, Version } from "@common/types";
import { DataService, Logger } from "../services";
import { AbstractDataParser } from "./abstract-data-parser";


export class WutheringWavesParser extends AbstractDataParser {

    // Constructor ------------------------------------------------------------
    constructor (data: DataFile, private readonly service: DataService = new DataService()) {
        super(data, service);
        this.documentID = "Wuthering Waves";
        this.data = data;
    }


    // Processing Controllers -------------------------------------------------

    /**
     * Parser controller for the Wuthering Waves parser.  Determines what items need to be parsed,
     * and hands those tasks off to the appropriate parsing methods.
     */
    protected override async parseSourceData (): Promise<void> {
        await this.getVersionInfo(this.data.sourceList.find(source => source.id === "Version")!);
        await this.createStaticEvents();

        for (const source of this.data.sourceList) {
            switch (source.id) {

                case "Doubled Pawns Matrix":
                    await this.doubledPawnsMatrix(source);
                    break;

                case "Events":
                    await this.parseEvents(source);
                    break;

                case "Tower of Adversity":
                    await this.parseTowerOfAdversity(source);
                    break;

                case "Whimpering Wastes":
                    await this.parseWhimperingWastes(source);
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
     * - Daily Activities
     * - Weekly Challenge
     * - Fantasies of the Thousand Gateways
     * - Shop Reset
     */
    private async createStaticEvents (): Promise<void> {
        const staticEvents: Array<Event> = [
            {
                title: "Daily Activities",
                url: "https://wutheringwaves.fandom.com/wiki/Guidebook/Activity",
                icon: "icons/wuthering-waves/daily-activities.svg",
                startDate: format(new Date(), formatDate),
                endDate: format(new Date(), formatDate),
                eventType: EventType.Daily,
                completed: false
            },

            {
                title: "Weekly Challenge",
                url: "https://wutheringwaves.fandom.com/wiki/Weekly_Challenge",
                icon: "icons/wuthering-waves/weekly-challenge.svg",
                startDate: format(startOfISOWeek(new Date()), formatDate),
                endDate: format(endOfISOWeek(new Date()), formatDate),
                eventType: EventType.Weekly,
                completed: false
            },

            {
                title: "Fantasies of the Thousand Gateways",
                url: "https://wutheringwaves.fandom.com/wiki/Fantasies_of_the_Thousand_Gateways",
                icon: "icons/wuthering-waves/fantasies-of-the-thousand-gateways.svg",
                startDate: format(startOfISOWeek(new Date()), formatDate),
                endDate: format(endOfISOWeek(new Date()), formatDate),
                eventType: EventType.Weekly,
                completed: false
            },

            {
                title: "Shop Reset",
                url: "",
                icon: "icons/wuthering-waves/shop-reset.svg",
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

            const versionTable = await this.getTableByHeaderText(page, "h2", "Version History");
            if (!versionTable) {
                Logger.warn("Could not find Version information.");
                return [];
            }

            const versionData = await page.evaluate((table) => {
                const rows = Array.from(table.querySelectorAll("tbody > tr"));
                const firstDataRow = rows.find(row => row.querySelectorAll("td").length >= 3);

                if (!firstDataRow) {
                    return null;
                }

                const columns = firstDataRow.querySelectorAll("td");
                const firstColumn = columns[0]?.textContent?.trim() || "";
                const secondColumn = columns[1]?.textContent?.trim() || "";
                const thirdColumn = columns[2]?.textContent?.trim() || "";

                const href = columns[1]?.querySelector("a")?.getAttribute("href") ?? "";
                const url = href ? new URL(href, window.location.origin).toString() : "";

                return {
                    title: `${firstColumn}: ${secondColumn}`,
                    releaseDate: thirdColumn,
                    url
                };
            }, versionTable);

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
     * Handles parsing the standard events listing of Wuthering Waves.
     *
     * @param sourceData - The data source containing event information.
     */
    private async parseEvents (sourceData: DataSource): Promise<void> {
        const events = await this.browserController(sourceData.url, async (page) => {

            // Loop table rows in page context and extract raw fields
            const tableData = await page.$$eval("table.article-table > tbody > tr:not(:has(th))", rows => rows.map((row) => {
                const columns = row.querySelectorAll("td");

                const [firstColumn] = columns;
                const title = firstColumn?.textContent?.trim() || "";
                const href = firstColumn?.querySelector("a")?.getAttribute("href") ?? "";
                const url = href ? new URL(href, window.location.origin).toString() : "";

                if (!title || !url) {
                    return null;
                }

                const secondColumn = columns[1]?.textContent?.trim() || "";
                const dates = secondColumn.split("–").map(date => date.trim());
                const [startDate, endDate = ""] = dates.length === 2 ? dates : [dates[0], ""];

                return { title, url, startDate, endDate };
            }).filter((row): row is { title: string; url: string; startDate: string; endDate: string } => row !== null));

            // Normalize types and return Event[]
            return tableData.map(row => ({
                title: row.title,
                url: row.url,
                icon: `icons/wuthering-waves/${this.getEventType(row.title, row.endDate)}.svg`,
                startDate: isValid(new Date(row.startDate)) ? format(new Date(row.startDate), formatDate) : "",
                endDate: isValid(new Date(row.endDate)) ? format(new Date(row.endDate), formatDate) : "",
                eventType: this.getEventType(row.title, row.endDate),
                completed: false
            }));
        });

        // Add events to the database
        await this.service.addRecords(this.documentID, "events", events);
    }

    /**
     * Parses Doubled Pawns Matrix reset information and derives its event window.
     *
     * @param sourceData - The data source containing Doubled Pawns Matrix information.
     */
    private async doubledPawnsMatrix (sourceData: DataSource): Promise<void> {
        const events = await this.browserController(sourceData.url, async (page) => {

            // Get source data and check if it exists
            const rawDateElement = await this.getElementByText(page, "th", "Doubled Pawns Matrix Stages", "includes");
            if (!rawDateElement) {
                return [];
            }

            // Extract reset date and calculate event duration
            const rawDate = await this.getTextContent(rawDateElement);
            if (!rawDate) {
                return [];
            }

            const normalizedResetDate = rawDate.replace("Doubled Pawns Matrix Stages", "").trim().split("-");

            const startDate = format(new Date(normalizedResetDate[0]), formatDate);
            const endDate = format(new Date(normalizedResetDate[1]), formatDate);

            return [{
                title: "Doubled Pawns Matrix",
                url: sourceData.url,
                icon: "icons/wuthering-waves/doubled-pawns-matrix.svg",
                startDate: isValid(new Date(startDate)) ? startDate : "",
                endDate: isValid(new Date(endDate)) ? endDate : "",
                eventType: EventType.Monthly,
                completed: false
            }];
        });

        // Add events to the database
        await this.service.addRecords(this.documentID, "events", events);
    }

    /**
     * Parses Tower of Adversity reset information and derives its event window.
     *
     * @param sourceData - The data source containing Tower of Adversity information.
     */
    private async parseTowerOfAdversity (sourceData: DataSource): Promise<void> {
        const events = await this.browserController(sourceData.url, async (page) => {

            // Get source data and check if it exists
            const rawDateElement = await this.getElementByText(page, "h3", "Resets", "includes");
            if (!rawDateElement) {
                return [];
            }

            // Extract reset date and calculate event duration
            const rawDate = await this.getTextContent(rawDateElement);
            if (!rawDate) {
                return [];
            }

            const normalizedResetDate = rawDate.replace("Resets on", "").trim();

            const resetDate = new Date(normalizedResetDate);
            if (!isValid(resetDate)) {
                return [];
            }

            const startDate = format(sub(resetDate, { days: 28 }), formatDate);
            const endDate = format(resetDate, formatDate);

            return [{
                title: "Tower of Adversity",
                url: sourceData.url,
                icon: "icons/wuthering-waves/tower-of-adversity.svg",
                startDate,
                endDate,
                eventType: EventType.Monthly,
                completed: false
            }];
        });

        // Add events to the database
        await this.service.addRecords(this.documentID, "events", events);
    }

    /**
     * Parses Whimpering Wastes reset information and derives its event window.
     *
     * @param sourceData - The data source containing Whimpering Wastes information.
     */
    private async parseWhimperingWastes (sourceData: DataSource): Promise<void> {
        const events = await this.browserController(sourceData.url, async (page) => {

            // Get source data and check if it exists
            const rawDateElement = await this.getElementByText(page, "h3", "Resets", "includes");
            if (!rawDateElement) {
                return [];
            }

            // Extract reset date and calculate event duration
            const rawDate = await this.getTextContent(rawDateElement);
            if (!rawDate) {
                return [];
            }

            const normalizedResetDate = rawDate.replace("Resets on", "").trim();

            const resetDate = new Date(normalizedResetDate);
            if (!isValid(resetDate)) {
                return [];
            }

            const startDate = format(sub(resetDate, { days: 28 }), formatDate);
            const endDate = format(resetDate, formatDate);

            return [{
                title: "Whimpering Wastes",
                url: sourceData.url,
                icon: "icons/wuthering-waves/whimpering-wastes.svg",
                startDate,
                endDate,
                eventType: EventType.Monthly,
                completed: false
            }];
        });

        // Add events to the database
        await this.service.addRecords(this.documentID, "events", events);
    }
}
