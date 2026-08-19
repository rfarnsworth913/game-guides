import { add, endOfISOWeek, endOfMonth, format, isValid, startOfISOWeek, startOfMonth } from "date-fns";
import * as puppeteer from "puppeteer";

import { formatDate, formatMonthName } from "@common/constants";
import { EventType } from "@common/enums";
import { DataFile, DataSource, Event, Version } from "@common/types";

import { DataService, Logger } from "../services";
import { AbstractDataParser } from "./abstract-data-parser";


export class ArknightsEndfield extends AbstractDataParser {

    // Constructor ------------------------------------------------------------
    constructor (data: DataFile, private readonly service: DataService = new DataService()) {
        super(data, service);
        this.documentID = data.id;
        this.data = data;
    }


    // Processing Controllers -------------------------------------------------

    /**
     * Parser controller for the Arknights Endfield parser.  Determines what items need to be parsed,
     * and hands those tasks off to the appropriate parsing methods.
     */
    protected override async parseSourceData (): Promise<void> {
        await this.createStaticEvents();

        for (const source of this.data.sourceList) {
            switch (source.id) {

                case "Version":
                    await this.getVersionInfo(source);
                    break;

                default:
                    Logger.warn("Unknown source ID: ", source.id);
                    break;
            }
        }

        await Promise.resolve();
    }

    /**
     * Creates events that are static and do not require parsing.
     *
     * There events are:
     * - Stock Redistribution
     * - Daily Routine
     * - Stamina Spend
     * - Weekly Routine
     */
    private async createStaticEvents (): Promise<void> {
        const staticEvents: Array<Event> = [
            {
                title: "Stock Redistribution",
                url: "https://endfield.wiki.gg/wiki/Stock_Redistribution",
                icon: "icons/arknights-endfield/stock-redistribution.svg",
                startDate: format(new Date(), formatDate),
                endDate: format(new Date(), formatDate),
                eventType: EventType.Daily,
                completed: false
            },

            {
                title: "Daily Routine",
                url: "https://endfield.wiki.gg/wiki/Operational_Manual#Daily",
                icon: "icons/arknights-endfield/daily-routine.svg",
                startDate: format(new Date(), formatDate),
                endDate: format(new Date(), formatDate),
                eventType: EventType.Daily,
                completed: false
            },

            {
                title: "Stamina Spend",
                url: "",
                icon: "icons/arknights-endfield/stamina.svg",
                startDate: format(new Date(), formatDate),
                endDate: format(new Date(), formatDate),
                eventType: EventType.Daily,
                completed: false
            },

            {
                title: "Weekly Routine",
                url: "https://endfield.wiki.gg/wiki/Weekly_Routine",
                icon: "icons/arknights-endfield/weekly-routine.svg",
                startDate: format(startOfISOWeek(new Date()), formatDate),
                endDate: format(endOfISOWeek(new Date()), formatDate),
                eventType: EventType.Weekly,
                completed: false
            },
        ];

        await this.service.addRecords(this.documentID, "events", staticEvents);
    }

    /**
     * Retrieves version information from the Arknights: Endfield source page.
     *
     * @param sourceData - The data source containing version information.
     */
    private async getVersionInfo (sourceData: DataSource): Promise<void> {
        const versionInfo = await this.browserController(sourceData.url, async (page) => {

            // Get version content element ------------------------------------
            const versionHeader = await this.getElementByText(page, "h2", "Version");
            if (!versionHeader) {
                Logger.warn("Could not find Version header element.");
                return [];
            }

            // Get version anchor element -------------------------------------
            const versionAnchorHandle = await page.evaluateHandle((header) => {
                let nextElement = header.nextElementSibling;

                while (nextElement) {
                    const versionAnchor = nextElement.querySelector(".mp-body a");
                    if (versionAnchor) {
                        return versionAnchor;
                    }

                    nextElement = nextElement.nextElementSibling;
                }

                return null;
            }, versionHeader);

            const isMissingAnchor = await page.evaluate(el => el === null, versionAnchorHandle);
            if (isMissingAnchor) {
                Logger.warn("Could not find version link after Version header.");
                return [];
            }

            const versionAnchorElement = versionAnchorHandle.asElement() as puppeteer.ElementHandle<HTMLAnchorElement> | null;
            if (!versionAnchorElement) {
                Logger.warn("Could not resolve version link element.");
                return [];
            }

            // Extract Version data from anchor element -----------------------
            const versionData = await page.evaluate((anchor: HTMLAnchorElement) => {
                const title = anchor.getAttribute("title") ?? "";
                const href = anchor.getAttribute("href") ?? "";
                const url = href ? new URL(href, window.location.origin).toString() : "";

                return { title, url };
            }, versionAnchorElement);

            if (!versionData.title) {
                Logger.warn("Could not parse version data.");
                return [];
            }

            return [{
                title: versionData.title,
                releaseDate: "",
                url: versionData.url
            } as Version];

        });

        this.versionInfo = versionInfo[0] as Version;
        this.isNewVersion = await this.service.updateVersion(this.documentID, versionInfo[0] as Version);
    }

}
