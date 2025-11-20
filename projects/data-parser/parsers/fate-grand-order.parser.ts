/* eslint-disable no-await-in-loop */
import chalk from "chalk";
import * as puppeteer from "puppeteer";

import { DataFile, DataSource, GenshinEvent } from "../lib/types";
import { DataService, timeout } from "../services";

export class FateGrandOrderParser {

    // Internal Properties ----------------------------------------------------
    private readonly data: DataFile;
    private readonly documentID = "Fate Grand Order";

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
    // eslint-disable-next-line max-lines-per-function
    private async parseEvents(sourceData: DataSource): Promise<void> {

        // Cleanup old Events -------------------------------------------------
        this.dataService.cleanupExpiredItems(
            this.documentID,
            "events",
            (event: GenshinEvent) => {
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

        // Get all events on the page
        const events = await page.$$eval("div.mw-parser-output > div", eventBlocks => eventBlocks
            .filter(eventBlock => window.getComputedStyle(eventBlock).verticalAlign === "top")
            .map((eventContent) => {

                // Get required elements
                const headerElement = eventContent?.querySelector("h2");
                const linkElement = headerElement?.querySelector("a");
                const paragraphs = eventContent?.querySelectorAll("p");
                const lastParagraph = paragraphs?.[paragraphs.length - 1];

                // Return null if any required elements are missing
                if (!eventContent || !headerElement || !linkElement || !lastParagraph) {
                    return null;
                }

                // Extract title from child h2 tag
                const title = headerElement.textContent?.trim() || "";

                // Extract URL from child h2 tag link
                const href = linkElement.getAttribute("href") ?? "";
                const url = href ? new URL(href, window.location.origin).toString() : "";

                // Extract banner from child img tag
                const banner = eventContent.querySelector("img")?.getAttribute("src") ?? "";

                // Extract start and end dates from the last paragraph
                const durationText = lastParagraph.textContent?.trim() || "";
                const cleanedDuration = durationText.replace("Duration: ", "").replace(/PST/g, "");
                const dates = cleanedDuration.split("~").map(date => date.trim());
                const [startDate, endDate] = dates;

                return {
                    title,
                    url,
                    banner,
                    startDate,
                    endDate,
                    eventType: "temporary",
                    completed: false
                };
            }));

        await browser.close();

        // Add events to the database
        const validEvents = events.filter(event => event !== null);
        await this.dataService.addRecords(this.documentID, "events", validEvents);
    }
}
