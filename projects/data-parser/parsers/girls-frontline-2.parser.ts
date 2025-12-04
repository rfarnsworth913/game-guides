/* eslint-disable no-await-in-loop */
import chalk from "chalk";
import * as puppeteer from "puppeteer";

import { DataFile, DataSource, GF2Event } from "../lib/types";
import { DataService, timeout } from "../services";

export class GirlsFrontline2Parser {

    // Internal Properties ----------------------------------------------------
    private readonly data: DataFile;
    private readonly documentID = "Girls Frontline 2";


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
            (event: GF2Event) => {
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

        const events = await page.$$eval(".mw-heading3", headings => headings.map((heading) => {
            const title = heading.textContent?.trim() || "";
            const url = heading.querySelector("a")?.getAttribute("href") ?? "";
            const banner = this.getBannerImage(heading);

            const eventData = this.getEventRow(heading);

            if (!eventData) {
                return null;
            }

            const dataColumn = eventData.querySelectorAll("td")[1]?.textContent?.trim().replace("Download iCal file", "") || "";
            const startDate = dataColumn.split("–")[0].trim();
            const endDate = dataColumn.split("–")[1].trim();

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

        // const events = await page.$$eval("table.wikitable > tbody > tr:not(:has(th))", rows => rows.map((row) => {

        //     const columns = row.querySelectorAll("td");

        //     // Extract title, URL, and banner from the first column
        //     const [firstColumn] = columns;
        //     const title = firstColumn?.textContent?.trim() || "";
        //     const href = firstColumn?.querySelector("a")?.getAttribute("href") ?? "";
        //     const url = href ? new URL(href, window.location.origin).toString() : "";
        //     const banner = firstColumn?.querySelector("img")?.getAttribute("src") ?? "";

        //     // Extract startDate and endDate from the second column
        //     const secondColumn = columns[1]?.textContent?.trim() || "";
        //     const [startDate, endDate] = secondColumn.split("–").map(date => date.trim());

        //     // Determine eventType from the third column
        //     const thirdColumn = columns[2]?.textContent?.trim() || "";
        //     const eventType = thirdColumn.toLowerCase().includes("indefinite") ? "permanent" : "temporary";

        //     return {
        //         title,
        //         url,
        //         banner,
        //         startDate,
        //         endDate,
        //         eventType,
        //         completed: false
        //     };
        // }));

        await browser.close();

        // Add events to the database
        await this.dataService.addRecords(this.documentID, "events", events);
    }

    /**
     * Finds the banner image URL from the next figure element before the next heading.
     *
     * @param heading - The heading element to search from.
     * @returns       The image URL if found, otherwise an empty string.
     */
    private getBannerImage(heading: Element): string {
        let banner = "";
        let currentElement = heading.nextElementSibling;

        while (currentElement) {
            // If we hit another heading, stop searching
            if (currentElement.classList.contains("mw-heading3")
                || currentElement.tagName.match(/^H[1-6]$/)) {
                break;
            }

            // If we find a figure element, extract the image URL
            if (currentElement.tagName === "FIGURE") {
                const img = currentElement.querySelector("img");
                if (img) {
                    banner = img.getAttribute("src") ?? "";
                    break;
                }
            }

            currentElement = currentElement.nextElementSibling;
        }

        return banner;
    }

    /**
     * Finds the next table after the heading and returns the row with "EN" in the 3rd column.
     *
     * @param heading - The heading element to search from.
     * @returns       The table row element if found, otherwise null.
     */
    private getEventRow(heading: Element): Element | null {
        let currentElement = heading.nextElementSibling;

        // Find the next table element
        while (currentElement) {
            // If we hit another heading, stop searching
            if (currentElement.classList.contains("mw-heading3")
                || currentElement.tagName.match(/^H[1-6]$/)) {
                break;
            }

            // If we find a table element
            if (currentElement.tagName === "table") {
                // Search for rows within the table
                const rows = currentElement.querySelectorAll("tr");
                for (const row of rows) {
                    const columns = row.querySelectorAll("td");
                    // Check if the 3rd column (index 2) contains exactly "EN"
                    if (columns.length >= 3 && columns[2].textContent?.trim() === "EN") {
                        return row;
                    }
                }
                // Table found but no matching row, stop searching
                break;
            }

            currentElement = currentElement.nextElementSibling;
        }

        return null;
    }
}
