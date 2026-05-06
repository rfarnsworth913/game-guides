import { addDays, endOfMonth, endOfWeek, format, isAfter, isValid, startOfMonth, startOfWeek } from "date-fns";

import { formatDate } from "@common/constants";
import { EventType } from "@common/enums";
import { DataFile, DataSource, Event, Version } from "@common/types";
import { DataService, Logger } from "../services";
import { AbstractDataParser } from "./abstract-data-parser";


export class HonkaiStarRailParser extends AbstractDataParser {


    // Constructor ------------------------------------------------------------
    constructor (data: DataFile, private readonly service: DataService = new DataService()) {
        super(data, service);
        this.documentID = data.id;
        this.data = data;
    }


    // Processing Controllers -------------------------------------------------

    /**
     * Parser controller for the Honkai Star Rail parser.  Determines what items need to be parsed,
     * and hands those tasks off to the appropriate parsing methods.
     */
    protected override async parseSourceData (): Promise<void> {
        await this.getVersionInfo(this.data.sourceList.find(source => source.id === "Version")!);
        await this.createStaticEvents(this.data);

        for (const source of this.data.sourceList) {
            switch (source.id) {

                case "Anomaly Arbitration":
                case "Apocalyptic Shadow":
                case "Pure Fiction":
                    await this.parseTreasuresLightward(source);
                    break;

                case "Events":
                    await this.parseEvents(source);
                    break;

                case "Forgotten Hall":
                    await this.parseTreasuresLightward(source, "h3");
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
     * - Daily Training
     * - Echo of War
     * - Embers Exchange
     * - Currency Wars
     * - Simulated Universe
     */
    // eslint-disable-next-line max-lines-per-function
    private async createStaticEvents (dataFile: DataFile): Promise<void> {
        const simulatedUniverseConfig = dataFile?.configuration?.["simulated-universe"] as { startDate?: string } | undefined;
        const simBaseDate = simulatedUniverseConfig?.startDate ?? "";

        const currencyWarsConfig = dataFile?.configuration?.["currency-wars"] as { startDate?: string } | undefined;
        const currencyWarsBaseDate = currencyWarsConfig?.startDate ?? "";

        const staticEvents: Array<Event> = [
            {
                title: "Daily Training",
                url: "https://honkai-star-rail.fandom.com/wiki/Interastral_Peace_Guide/Daily_Training",
                icon: "icons/honkai-star-rail/daily-training.svg",
                startDate: format(new Date(), formatDate),
                endDate: format(new Date(), formatDate),
                eventType: EventType.Daily,
                completed: false
            },

            {
                title: "Echo of War",
                url: "https://honkai-star-rail.fandom.com/wiki/Echo_of_War",
                icon: "icons/honkai-star-rail/echo-of-war.svg",
                startDate: format(startOfWeek(new Date(), { weekStartsOn: 1 }), formatDate),
                endDate: format(endOfWeek(addDays(new Date(), 7), { weekStartsOn: 1 }), formatDate),
                eventType: EventType.Weekly,
                completed: false
            },

            {
                title: "Embers Exchange",
                url: "https://honkai-star-rail.fandom.com/wiki/Embers_Exchange",
                icon: "icons/honkai-star-rail/embers-exchange.svg",
                startDate: format(startOfMonth(new Date()), formatDate),
                endDate: format(endOfMonth(new Date()), formatDate),
                eventType: EventType.Monthly,
                completed: false
            },

            {
                title: "Currency Wars",
                url: "https://honkai-star-rail.fandom.com/wiki/Currency_Wars",
                icon: "icons/honkai-star-rail/currency-wars.svg",
                startDate: this.calculateDate(currencyWarsBaseDate, "start"),
                endDate: this.calculateDate(currencyWarsBaseDate, "end"),
                eventType: EventType.Weekly,
                completed: false
            },

            {
                title: "Simulated Universe",
                url: "https://honkai-star-rail.fandom.com/wiki/Simulated_Universe",
                icon: "icons/honkai-star-rail/simulated-universe.svg",
                startDate: this.calculateDate(simBaseDate, "start"),
                endDate: this.calculateDate(simBaseDate, "end"),
                eventType: EventType.Weekly,
                completed: false
            }
        ];

        await this.service.addRecords(this.documentID, "events", staticEvents);
    }

    /**
     * Calculates a rolling two-week timeframe from an initial date where endDate is always in the future.
     *
     * @param initialDate - Base start date as a date string.
     * @param calType     - Date to return: "start" or "end".
     */
    private calculateDate (initialDate: string, calType: "start" | "end"): string {
        const baseDate = new Date(initialDate);
        if (!isValid(baseDate)) {
            return "";
        }

        const now = new Date();
        let startDate = startOfWeek(baseDate, { weekStartsOn: 1 });
        let endDate = endOfWeek(addDays(startDate, 7), { weekStartsOn: 1 });

        while (!isAfter(endDate, now)) {
            startDate = addDays(startDate, 14);
            endDate = endOfWeek(addDays(startDate, 7), { weekStartsOn: 1 });
        }

        return calType === "start" ? format(startDate, formatDate) : format(endDate, formatDate);
    }

    /**
     * Retrieves the version information from the specified data source and updates the internal version state.
     *
     * @param sourceData - The data source containing version information.
     */
    private async getVersionInfo(sourceData: DataSource): Promise<void> {
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
                const patchID = columns[0]?.textContent?.trim() || "";
                const patchName = columns[1]?.textContent?.trim() || "";
                const releaseDate = columns[2]?.textContent?.trim() || "";

                const href = columns[1]?.querySelector("a")?.getAttribute("href") ?? "";
                const url = href ? new URL(href, window.location.origin).toString() : "";

                return {
                    title: `${patchID}: ${patchName}`,
                    releaseDate,
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
     * Handles parsing data for the Treasures Lightward type of events.  These include:
     *
     * - Anomaly Arbitration
     * - Apocalyptic Shadow
     * - Forgotten Hall
     * - Pure Fiction
     *
     * @param sourceData - Source data for the Treasures Lightward event.
     * @param headerTag  - Header tag to locate the event table (default: h2).
     */
    private async parseTreasuresLightward (sourceData: DataSource, headerTag = "h2"): Promise<void> {
        const events = await this.browserController(sourceData.url, async (page) => {

            // Get table that contains the event dates
            const tableElement = await this.getTableByHeaderText(page, headerTag, "History");
            if (!tableElement) {
                Logger.warn(`Could not find ${sourceData.id} history table.`);
                return [];
            }

            // Extract date information from table (last row)
            const rawDateData = await tableElement.evaluate((table) => {
                const targetRow = table.querySelector("tbody tr:last-child");

                if (!targetRow) {
                    return null;
                }

                const cells = targetRow.querySelectorAll("td");
                const startDate = cells[1]?.textContent?.trim() || "";
                const endDate = cells[2]?.textContent?.trim() || "";

                return { startDate, endDate };
            });

            if (!rawDateData?.startDate || !rawDateData?.endDate) {
                Logger.warn(`Could not extract ${sourceData.id} dates from table.`);
                return [];
            }

            // Parse date content
            const normalizeDateString = (value: string): string => value.replace(/GMT([+-])(\d{1,2})\b/i, (_, sign: string, hour: string) => `GMT${sign}${hour.padStart(2, "0")}00`);

            const parsedStartDate = new Date(normalizeDateString(rawDateData.startDate));
            const parsedEndDate = new Date(normalizeDateString(rawDateData.endDate));

            if (!isValid(parsedStartDate) || !isValid(parsedEndDate)) {
                Logger.warn(`Could not parse ${sourceData.id} dates into valid Date objects.`);
                return [];
            }

            // Create event object
            return [{
                title: sourceData.id,
                url: sourceData.url,
                icon: `icons/honkai-star-rail/${sourceData.id.toLowerCase().replace(/ /g, "-")}.svg`,
                startDate: format(parsedStartDate, formatDate),
                endDate: format(parsedEndDate, formatDate),
                eventType: EventType.EndGame,
                completed: false
            }];
        });

        // Add events to the database
        await this.service.addRecords(this.documentID, "events", events);
    }

    /**
     * Handles parsing the standard events listing of Honkai Star Rail.
     *
     * @param sourceData - The data source containing event information.
     */
    private async parseEvents (sourceData: DataSource): Promise<void> {
        const events = await this.browserController(sourceData.url, async (page) => {

            // Loop table rows in page context and extract raw fields
            const tableData = await page.$$eval("table.wikitable > tbody > tr:not(:has(th))", rows => rows.map((row) => {
                const columns = row.querySelectorAll("td");

                const [firstColumn] = columns;
                const title = firstColumn?.textContent?.trim() || "";
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
                icon: `icons/honkai-star-rail/${this.getEventType(row.thirdColumn, row.endDate)}.svg`,
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
