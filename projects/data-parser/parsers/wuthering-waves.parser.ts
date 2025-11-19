/* eslint-disable no-await-in-loop */
import chalk from "chalk";
import * as puppeteer from "puppeteer";

import { DataFile, DataSource, WutheringEvent } from "../lib/types";
import { DataService, timeout } from "../services";

export class WutheringWavesParser {

    // Internal Properties ----------------------------------------------------
    private readonly data: DataFile;
    private readonly documentID = "Wuthering Waves";


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

        for (const source of this.data.sourceList) {
            console.info(chalk.blueBright("Parsing source: "), source.id);

            switch (source.id) {
            case "Events":
                await this.parseEvents(source);
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
     * Handles paring event data in the following process:
     * - Cleans up expired events from the database.
     *
     * @param sourceData - The data source containing event information.
     */
    private async parseEvents(sourceData: DataSource): Promise<void> {

        // Cleanup old Events -------------------------------------------------
        this.dataService.cleanupExpiredItems(
            this.documentID,
            "events",
            (event: WutheringEvent) => {
                const endDate = new Date(event.endDate);
                return endDate >= new Date();
            }
        ).catch((err) => {
            console.error(chalk.red("Error handling events: "), err);
        });

        // Parse Events Source ------------------------------------------------
        const eventsURL = sourceData.url;
        const browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(eventsURL, { waitUntil: "domcontentloaded" });
        await timeout(10000); // Wait for dynamic content to load

        console.warn(chalk.yellow("Extracting event data from: "), eventsURL);

        let eventType = "";

        // Get all events on the page
        // eslint-disable-next-line complexity
        const events = await page.$$eval("h3, table.article-table > tbody > tr:not(:has(th))", rows => rows.map((row) => {

            if (row.nodeType === Node.ELEMENT_NODE && (row as Element).tagName.toLowerCase() === "h3") {
                eventType = row.textContent?.trim().toLowerCase().includes("permanent") ? "permanent" : "temporary";
                return null;
            }

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

            if (!title || !startDate || !endDate) {
                return null;
            }

            return {
                title,
                url,
                banner,
                startDate,
                endDate,
                eventType,
                completed: false
            };
        }));

        await browser.close();

        // Add events to the database
        const validEvents = events.filter(event => event !== null);
        await this.dataService.addRecords(this.documentID, "events", validEvents);
    }
}
