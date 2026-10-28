import { isFuture } from "date-fns";

import * as puppeteer from "puppeteer";

import { EventType } from "@common/enums";
import { DataFile, Event, Version } from "@common/types";
import { DataService, Logger, timeout } from "../services";


export class AbstractDataParser {

    // Internal Properties ----------------------------------------------------
    protected data!: DataFile;
    protected documentID = "";

    protected isNewVersion = false;
    protected versionInfo: Version = {
        title: "",
        releaseDate: "",
        url: ""
    };

    // Seems to help with getting dynamic content
    protected readonly headless = false;
    protected readonly timeoutDuration = 10000;


    // Constructor ------------------------------------------------------------
    constructor (data: DataFile, private readonly dataService: DataService) { }


    // Processing Controllers -------------------------------------------------

    /**
     * Parser controller for the Genshin Impact parser.  Determines what items need to be parsed,
     * and hands those tasks off to the appropriate parsing methods.
     */
    async parseData (): Promise<void> {
        const logMessage = `==================== Parsing: ${this.documentID} ====================`;

        Logger.info(logMessage);

        // Check if data is loaded
        if (!this.data?.sourceList || this.data.sourceList.length === 0) {
            throw new Error("No data provided for parsing.");
        }

        await this.cleanupExpiredEvents();
        await this.parseSourceData();

        await this.dataService.disconnect();

        Logger.info("=".repeat(logMessage.length));
    }

    // Parsers ----------------------------------------------------------------

    /**
     * Cleans up expired events from the database.
     */
    private async cleanupExpiredEvents (): Promise<void> {
        try {
            await Promise.resolve(
                this.dataService.cleanupExpiredItems(
                    this.documentID,
                    "events",
                    (event: Event) => {
                        const endDate = new Date(event.endDate ?? "");
                        return isFuture(endDate);
                    }
                )
            );
        } catch (err) {
            Logger.error("Error handling events: ", err);
        }
    }

    /**
     * Override method to handle solution specific parsing logic.
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    protected async parseSourceData (): Promise<void> {
        throw new Error("Method not implemented.");
    }

    /**
     * Common controller to setup Puppeteer and execute parsing logic.
     *
     * @param url      - The URL of the page to parse.
     * @param callback - The parsing logic to execute on the loaded page.
     * @returns        Array of Event objects returned by the callback.
     */
    // eslint-disable-next-line @stylistic/max-len
    protected async browserController (url: string, callback: (page: puppeteer.Page) => Promise<Array<Event | Version>>): Promise<Array<Event | Version>> {

        // Setup browser ------------------------------------------------------
        const browser = await puppeteer.launch({ headless: this.headless });
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await timeout(this.timeoutDuration); // Wait for dynamic content to load

        Logger.info("Extracting data from: ", url);

        let data: Array<Event | Version> = [];

        // Execute parsing callback -------------------------------------------
        try {
            data = await callback(page);
        } catch (err) {
            Logger.error("Error during parsing: ", err);
        }

        await browser.close();

        return data;
    }

    /**
     * Finds the element on the page matching the specified tag and text.
     *
     * @param page      - The Puppeteer page instance.
     * @param tag       - The HTML tag to search for.
     * @param text      - The text content to match.
     * @param matchMode - The mode of text matching: "exact" or "includes".
     * @returns         The matching element handle or null if not found.
     */
    protected async getElementByText (page: puppeteer.Page, tag: string, text: string, matchMode: "exact" | "includes" = "exact"): Promise<puppeteer.ElementHandle<Element> | null> {
        const elements = await page.$$(tag);
        for (const element of elements) {
            const elementText = await page.evaluate(el => el.textContent?.trim() || "", element);
            if ((matchMode === "exact" && elementText === text) || (matchMode === "includes" && new RegExp(text, "i").test(elementText))) {
                return element;
            }
        }

        return null;
    }

    /**
     * Extracts and trims the text content from a Puppeteer element handle.
     *
     * @param element - The Puppeteer element handle.
     * @returns       The trimmed text content of the element.
     */
    protected async getTextContent (element: puppeteer.ElementHandle<Element>): Promise<string> {
        return await element.evaluate(el => el.textContent?.trim() || "");
    }

    /**
     * Loops through elements by tag and finds the table element that follows the selected element.
     *
     * @param page       - The Puppeteer page instance.
     * @param tag        - The HTML tag to search for (e.g., "h2", "h3").
     * @param headerText - The text content to match in the tag.
     * @returns          The table element handle following the matched element, or null if not found.
     */
    // eslint-disable-next-line @stylistic/max-len
    protected async getTableByHeaderText (page: puppeteer.Page, tag: string, headerText: string): Promise<puppeteer.ElementHandle<Element> | null> {
        const elements = await page.$$(tag);

        for (const element of elements) {
            const elementText = await page.evaluate(el => el.textContent?.trim() || "", element);

            // Check if the element text matches
            if (elementText.includes(headerText)) {
                // Get the next sibling that is a table
                const tableElement = await page.evaluateHandle((el: Element) => {
                    let nextElement = el.nextElementSibling;

                    // Loop through siblings to find a table
                    while (nextElement) {
                        if (nextElement.tagName.toLowerCase() === "table") {
                            return nextElement;
                        }
                        nextElement = nextElement.nextElementSibling;
                    }

                    return null;
                }, element);

                // Check if we found a table element
                const isNull = await page.evaluate(el => el === null, tableElement);
                if (!isNull) {
                    return tableElement.asElement() as puppeteer.ElementHandle<Element>;
                }
            }
        }

        return null;
    }

    // Mapping Utilities ------------------------------------------------------

    /**
     * Maps the supplied event to it's corresponding EventType.
     *
     * @param eventIdentifier - The identifier string for the event.
     * @param endDate         - The end date of the event.
     * @returns               - The corresponding EventType based on the identifier and end date.
     */
    protected getEventType (eventIdentifier: string, endDate: string): EventType {
        const normID = eventIdentifier.toLowerCase().trim();

        // Handle end date processing
        if (endDate === "" || endDate.toLowerCase() === "indefinite") {
            return EventType.Permanent;
        }

        // Handle event identifier mapping
        switch (true) {

            // Battle Pass --------------------------------------------------------
            case normID.includes("miliastra pass"):
            case normID.includes("battle pass"):
                return EventType.BattlePass;

            // End Game -----------------------------------------------------------
            case normID.includes("stygian onslaught"):
                return EventType.EndGame;

            // Permanent ----------------------------------------------------------
            case normID.includes("indefinite"):
                return EventType.Permanent;

            // TCG ----------------------------------------------------------------
            case normID.includes("forge realm"):
            case normID.includes("heated battle mode"):
                return EventType.TCG;

            // Web ----------------------------------------------------------------
            case normID.includes("web"):
                return EventType.Web;

            default:
                return EventType.Temporary;
        }
    }
}
