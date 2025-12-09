import chalk from "chalk";
import { format, isFuture } from "date-fns";
import * as puppeteer from "puppeteer";

import { dateFormat } from "../lib/constants";
import { DataFile, DataSource, HonkaiStarRailEvent } from "../lib/types";
import { DataService, timeout } from "../services";


export class HonkaiStarRailParser {

    // Internal Properties ----------------------------------------------------
    private readonly data: DataFile;
    private readonly documentID = "Honkai Star Rail";

    // Seems to help with getting dynamic content
    private readonly headless = false;


    // Constructor ------------------------------------------------------------
    constructor(data: DataFile, private readonly dataService: DataService = new DataService()) {
        this.data = data;
    }


    // Processing Controllers -------------------------------------------------

    /**
     * Parses the source data file and handles determining how data should be parsed within
     * the application.
     */
    async parseData(): Promise<void> {

        // Check if data is loaded
        if (!this.data?.sourceList || this.data.sourceList.length === 0) {
            throw new Error("No data provided for parsing.");
        }

        await this.cleanupExpiredEvents();

        for (const source of this.data.sourceList) {
            console.info(chalk.blueBright("Parsing source: "), source.id);

            switch (source.id) {
            case "Events":
                await this.parseEvents(source);
                break;

            case "Anomaly Arbitration":
            case "Apocalyptic Shadow":
            case "Forgotten Hall":
            case "Pure Fiction":
                await this.parseTreasuresLightward(source);
                break;

            default:
                console.warn(chalk.yellowBright("Unknown source ID: "), source.id);
                break;
            }
        }

        await this.dataService.disconnect();
    }

    // Parsers ----------------------------------------------------------------

    /**
     * Cleans up expired events from the database.
     */
    private async cleanupExpiredEvents(): Promise<void> {
        try {
            await Promise.resolve(
                this.dataService.cleanupExpiredItems(
                    this.documentID,
                    "events",
                    (event: HonkaiStarRailEvent) => {
                        const endDate = new Date(event.endDate);
                        return isFuture(endDate) || event.eventType === "permanent";
                    }
                )
            );
        } catch (err) {
            console.error(chalk.red("Error handling events: "), err);
        }
    }

    /**
     * Common controller to setup Puppeteer and execute parsing logic.
     *
     * @param url      - The URL of the page to parse.
     * @param callback - The parsing logic to execute on the loaded page.
     * @returns        Array of HonkaiStarRailEvent objects returned by the callback.
     */
    private async parserController(
        url: string,
        callback: (page: puppeteer.Page) => Promise<Array<HonkaiStarRailEvent>>
    ): Promise<Array<HonkaiStarRailEvent>> {

        // Setup browser ------------------------------------------------------
        const browser = await puppeteer.launch({ headless: this.headless });
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await timeout(10000); // Wait for dynamic content to load

        console.warn(chalk.yellow("Extracting data from: "), url);

        let data: Array<HonkaiStarRailEvent> = [];

        // Execute parsing callback -------------------------------------------
        try {
            data = await callback(page);
        } catch (err) {
            console.error(chalk.red("Error during parsing: "), err);
        }

        await browser.close();

        return data;
    }

    /**
     * Handles parsing the standard events listing of Genshin Impact.
     *
     * @param sourceData - The data source containing event information.
     */
    private async parseEvents(sourceData: DataSource): Promise<void> {

        const events = await this.parserController(sourceData.url, async page => await page.$$eval(
            "table.wikitable > tbody > tr:not(:has(th))",
            rows => rows.map((row) => {

                const columns = row.querySelectorAll("td");

                // Extract title, URL, and banner from the first column
                const [firstColumn] = columns;
                const title = firstColumn?.textContent?.trim() || "";
                const href = firstColumn?.querySelector("a")?.getAttribute("href") ?? "";
                const url = href ? new URL(href, window.location.origin).toString() : "";
                const banner = firstColumn?.querySelector("img")?.getAttribute("src") ?? "";

                // Extract startDate and endDate from the second column
                const secondColumn = columns[1]?.textContent?.trim() || "";
                const [startDate, endDate] = secondColumn.split("–").map(date => date.trim());

                // Determine eventType from the third column
                const thirdColumn = columns[2]?.textContent?.trim() || "";
                const eventType = thirdColumn.toLowerCase().includes("indefinite") ? "permanent" : "temporary";

                return {
                    title,
                    url,
                    banner,
                    startDate,
                    endDate,
                    eventType,
                    completed: false
                };
            })
        ));

        // Add events to the database
        await this.dataService.addRecords(this.documentID, "events", events);
    }

    /**
     * Parses the Treasures Lightward category of events and stores them in the database.
     *
     * @param sourceData - The data source containing event information.
     * @returns          Promise that resolves when the records have been stored.
     */
    private async parseTreasuresLightward(sourceData: DataSource): Promise<void> {

        const events = await this.parserController(sourceData.url, async page => await page.$$eval(
            "h2, h3", (headings) => {
                // Locate the H2 or H3 with text containing "History"
                const historyHeading = headings.find(h => h.textContent?.trim().includes("History"));
                if (!historyHeading) {
                    return [] as Array<HonkaiStarRailEvent>;
                }

                // Find the table that follows the History heading ------------
                let nextEl: Element | null = historyHeading.nextElementSibling;
                let table: HTMLTableElement | null = null;
                while (nextEl) {
                    if (nextEl.tagName === "TABLE") {
                        table = nextEl as HTMLTableElement;
                        break;
                    }
                    nextEl = nextEl.nextElementSibling;
                }

                if (!table) {
                    return [] as Array<HonkaiStarRailEvent>;
                }

                const tbody = table.querySelector("tbody") ?? table;
                const rows = Array.from(tbody.querySelectorAll("tr")).filter(r => !r.querySelector("th"));
                if (rows.length === 0) {
                    return [] as Array<HonkaiStarRailEvent>;
                }

                const lastRow = rows[rows.length - 1];
                const cells = lastRow.querySelectorAll("td");

                const startDate = (cells[1]?.textContent ?? "").replace("(Server Time)", "").trim();
                const endDate = (cells[2]?.textContent ?? "").replace("(Server Time)", "").trim();

                return [{
                    title: "",
                    url: "",
                    banner: "",
                    startDate,
                    endDate,
                    eventType: "end-game",
                    completed: false
                }];
            }
        ));

        // Guard: no rows found -> nothing to update ---------------------------
        if (events.length === 0) {
            console.warn(chalk.yellow("No Treasures Lightward rows found; skipping update."));
            return;
        }

        // Update event details -----------------------------------------------
        const [event] = events;
        const formatted = this.formatTreasuresEvent(event, sourceData);

        // Add events to the database
        await this.dataService.addRecords(this.documentID, "events", [formatted]);
    }

    /**
     * Formats a Treasures Lightward event with source metadata and date formatting.
     */
    private formatTreasuresEvent(event: HonkaiStarRailEvent, sourceData: DataSource): HonkaiStarRailEvent {
        return {
            ...event,
            title: sourceData.id,
            banner: sourceData.banner ?? "",
            url: sourceData.url,
            startDate: format(new Date(event.startDate), dateFormat),
            endDate: format(new Date(event.endDate), dateFormat)
        };
    }

}
