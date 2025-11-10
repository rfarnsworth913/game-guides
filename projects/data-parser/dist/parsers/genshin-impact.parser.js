/* eslint-disable no-await-in-loop */
import chalk from "chalk";
import * as puppeteer from "puppeteer";
import { DataService } from "../services/data.service";
export class GenshinImpactParser {
    dataService;
    // Internal Properties ----------------------------------------------------
    data;
    // Constructor ------------------------------------------------------------
    constructor(data, dataService = new DataService()) {
        this.dataService = dataService;
        this.data = data;
        this.parseData().catch((err) => {
            console.error(chalk.red("Error parsing Genshin Impact data: "), err);
        });
    }
    // Processing Controllers -------------------------------------------------
    /**
     * Parses the source data file and handles determining how data should be parsed within
     * the application.
     */
    async parseData() {
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
    async parseEvents(sourceData) {
        // Cleanup old Events -------------------------------------------------
        this.dataService.cleanupExpiredItems("Genshin Impact", "events", (event) => {
            const endDate = new Date(event.endDate);
            return endDate >= new Date();
        }).catch((err) => {
            console.error(chalk.red("Error handling events: "), err);
        });
        // Parse Events Source ------------------------------------------------
        const eventsURL = sourceData.url;
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(eventsURL, { waitUntil: "domcontentloaded" });
        // Find the table directly following the header and loop over rows
        await page.waitForSelector("#Current");
        const events = await page.$$eval("#Current + table tr", rows => rows.map(row => row.textContent?.trim() || ""));
        events.forEach((row, index) => {
            console.info(chalk.green(`Row ${index + 1}:`), row);
        });
        await browser.close();
        // Get events that are currently active
        // Compare with database entries
        // Add new events to database
    }
}
