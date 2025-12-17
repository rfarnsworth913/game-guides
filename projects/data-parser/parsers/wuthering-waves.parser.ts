import chalk from "chalk";
import { format, isFuture } from "date-fns";
import * as puppeteer from "puppeteer";

import { dateFormat } from "../lib/constants";
import { DataFile, DataSource, WutheringEvent } from "../lib/types";
import { DataService, timeout } from "../services";


export class WutheringWavesParser {

    // Internal Properties ----------------------------------------------------
    private readonly data: DataFile;
    private readonly documentID = "Wuthering Waves";

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
                    (event: WutheringEvent) => {
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
     * @returns        Array of GenshinEvent objects returned by the callback.
     */
    private async parserController(
        url: string,
        callback: (page: puppeteer.Page) => Promise<Array<WutheringEvent | null>>
    ): Promise<Array<WutheringEvent | null>> {

        // Setup browser ------------------------------------------------------
        const browser = await puppeteer.launch({ headless: this.headless });
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await timeout(10000); // Wait for dynamic content to load

        console.warn(chalk.yellow("Extracting data from: "), url);

        let data: Array<WutheringEvent | null> = [];
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
     * Handles parsing the standard events listing of Wuthering Waves.
     *
     * @param sourceData - The data source containing event information.
     */
    private async parseEvents(sourceData: DataSource): Promise<void> {

        let eventType = "";

        const events = await this.parserController(sourceData.url, async page => await page.$$eval(
            "h3, table.article-table > tbody > tr:not(:has(th))",
            // eslint-disable-next-line complexity
            rows => rows.map((row) => {

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
                    startDate: format(new Date(startDate), dateFormat),
                    endDate: format(new Date(endDate), dateFormat),
                    eventType,
                    completed: false
                };
            })
        ));

        // Add events to the database
        const validEvents = events.filter(event => event !== null);
        await this.dataService.addRecords(this.documentID, "events", validEvents);
    }
}
