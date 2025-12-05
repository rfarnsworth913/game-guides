import chalk from "chalk";
import { addDays, format, isFuture } from "date-fns";
import * as puppeteer from "puppeteer";

import { dateFormat } from "../lib/constants";
import { DataFile, DataSource, GenshinEvent } from "../lib/types";
import { DataService, timeout } from "../services";


export class GenshinImpactParser {

    // Internal Properties ----------------------------------------------------
    private readonly data: DataFile;
    private readonly documentID = "Genshin Impact";

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

            case "Imaginarium Theater":
                await this.parseImaginariumTheater(source);
                break;

            case "Spiral Abyss":
                await this.parseSpiralAbyss(source);
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
                    (event: GenshinEvent) => {
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
        callback: (page: puppeteer.Page) => Promise<Array<GenshinEvent>>
    ): Promise<Array<GenshinEvent>> {

        // Setup browser ------------------------------------------------------
        const browser = await puppeteer.launch({ headless: this.headless });
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await timeout(10000); // Wait for dynamic content to load

        console.warn(chalk.yellow("Extracting data from: "), url);

        let data: Array<GenshinEvent> = [];

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
     * Gets the current Spiral Abyss reset timer.
     *
     * @param sourceData - The data source containing Spiral Abyss information.
     */
    private async parseSpiralAbyss(sourceData: DataSource): Promise<void> {

        const events = await this.parserController(sourceData.url, async(page) => {
            // Extract days value from countdown string like "(NA) Ends in: 21d 18h 16m 10s"
            const countdown = await page.$eval(".gi-countdown-NA", el => el.textContent?.trim() || "");
            const daysMatch = countdown.match(/(\d+)d/);
            const daysValue = daysMatch ? parseInt(daysMatch[1], 10) : 0;

            return [{
                title: "Spiral Abyss",
                url: sourceData.url,
                banner: "https://static.wikia.nocookie.net/gensin-impact/images/c/ca/Domain_Spiral_Abyss_Abyssal_Moon_Spire.png/revision/latest",
                startDate: format(new Date(), dateFormat),
                endDate: format(addDays(new Date(), daysValue), dateFormat),
                eventType: "end-game",
                completed: false
            }];
        });

        // Add events to the database
        await this.dataService.addRecords(this.documentID, "events", events);
    }

    /**
     * Gets the current Imaginarium Theater season dates.
     *
     * @param sourceData - The data source containing Imaginarium Theater information.
     */
    private async parseImaginariumTheater(sourceData: DataSource): Promise<void> {

        const events = await this.parserController(sourceData.url, async(page) => {
            // Find h3 containing "Current Season" and extract dates from following paragraph
            const dates = await page.$$eval("h3", (headings) => {
                for (const heading of headings) {
                    if (heading.textContent?.includes("Current Season")) {
                        // Get the first paragraph after this h3
                        let nextElement = heading.nextElementSibling;
                        while (nextElement) {
                            if (nextElement.tagName === "P") {
                                const text = nextElement.textContent?.trim() || "";
                                // Extract dates from format: "...from November 01, 2025 to November 30, 2025."
                                const dateMatch = text.match(/from\s+(\w+\s+\d+,\s+\d{4})\s+to\s+(\w+\s+\d+,\s+\d{4})/);
                                if (dateMatch) {
                                    return {
                                        startDate: dateMatch[1],
                                        endDate: dateMatch[2]
                                    };
                                }
                                break;
                            }
                            nextElement = nextElement.nextElementSibling;
                        }
                    }
                }
                return { startDate: "", endDate: "" };
            });

            return [{
                title: "Imaginarium Theater",
                url: sourceData.url,
                banner: "https://static.wikia.nocookie.net/gensin-impact/images/8/81/Domain_Mysterious_Room.png/revision/latest",
                startDate: dates.startDate,
                endDate: dates.endDate,
                eventType: "end-game",
                completed: false
            }];
        });

        // Add events to the database
        await this.dataService.addRecords(this.documentID, "events", events);
    }
}
