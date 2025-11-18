/* eslint-disable no-await-in-loop */
import chalk from "chalk";
import * as puppeteer from "puppeteer";

import { DataFile, DataSource, ZenlessEvent } from "../lib/types";
import { DataService } from "../services";

export class ZenlessZoneZeroParser {

    // Internal Properties ----------------------------------------------------
    private readonly data: DataFile;
    private readonly documentID = "Zenless Zone Zero";


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
            (event: ZenlessEvent) => {
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

        console.warn(chalk.yellow("Extracting event data from: "), eventsURL);

        // Get all events on the page
        const events = await page.$$eval("table.wikitable > tbody > tr:not(:has(th))", rows => rows.map((row) => {

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
        }));

        await browser.close();

        // Add events to the database
        await this.dataService.addRecords(this.documentID, "events", events);
    }
}
