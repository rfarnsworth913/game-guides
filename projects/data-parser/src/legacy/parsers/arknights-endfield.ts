/** @deprecated Legacy parser regression code. Production imports use src/sync. */
import { endOfISOWeek, format, startOfISOWeek } from "date-fns";

import { DATE_FORMAT } from "@lib/constants";
import { EventType } from "@lib/enums";
import type { DataFile, DataSource, Event } from "@lib/types";

import { DataService, Logger } from "../../services";
import { AbstractDataParser } from "./abstract-data-parser";


/** @deprecated Legacy implementation retained for regression tests. Use the sync pipeline. */
export class ArknightsEndfield extends AbstractDataParser {

    // Constructor ------------------------------------------------------------
    constructor (data: DataFile, private readonly service: DataService = new DataService()) {
        super(data, service);
        this.documentID = data.id;
        this.data = data;

        this.imageOutputPath = `${this.imageOutputPath}endfield/`;
    }


    // Processing Controllers -------------------------------------------------

    /**
     * Parser controller for the Arknights Endfield parser.  Determines what items need to be parsed,
     * and hands those tasks off to the appropriate parsing methods.
     */
    protected override async parseSourceData (): Promise<void> {

        for (const source of this.data.sourceList) {
            switch (source.id) {

                case "Version":
                    await this.getVersionInfo(source);
                    await this.createStaticEvents();
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
                startDate: format(new Date(), DATE_FORMAT),
                endDate: format(new Date(), DATE_FORMAT),
                eventType: EventType.Daily,
                completed: false
            },

            {
                title: "Daily Routine",
                url: "https://endfield.wiki.gg/wiki/Operational_Manual#Daily",
                icon: "icons/arknights-endfield/daily-routine.svg",
                startDate: format(new Date(), DATE_FORMAT),
                endDate: format(new Date(), DATE_FORMAT),
                eventType: EventType.Daily,
                completed: false
            },

            {
                title: "Stamina Spend",
                url: "",
                icon: "icons/arknights-endfield/stamina.svg",
                startDate: format(new Date(), DATE_FORMAT),
                endDate: format(new Date(), DATE_FORMAT),
                eventType: EventType.Daily,
                completed: false
            },

            {
                title: "Weekly Routine",
                url: "https://endfield.wiki.gg/wiki/Weekly_Routine",
                icon: "icons/arknights-endfield/weekly-routine.svg",
                startDate: format(startOfISOWeek(new Date()), DATE_FORMAT),
                endDate: format(endOfISOWeek(new Date()), DATE_FORMAT),
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
            const versionTable = await this.getTableByHeaderText(page, "h2", "Current Version");
            if (!versionTable) {
                Logger.warn("Could not find Version header element.");
                return [];
            }

            const versionData = await page.evaluate((tableElement) => {
                const row = Array.from(tableElement.querySelectorAll("tr"))
                    .find(item => item.querySelector("td"));

                if (!row) {
                    return null;
                }

                const cells = row.querySelectorAll("td");
                const anchor = cells[0]?.querySelector<HTMLAnchorElement>("a[title]:not(.image):not([href*=\"/wiki/File:\"])");

                const imageTag = cells[0]?.querySelector<HTMLImageElement>("img");

                const title = anchor?.getAttribute("title") ?? "";
                const href = anchor?.getAttribute("href") ?? "";
                const dateText = cells[1]?.textContent ?? "";
                const releaseDate = dateText.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
                const url = href ? new URL(href, window.location.origin).toString() : "";

                return { title, url, imageUrl: imageTag?.src ?? "", ...releaseDate ? { releaseDate } : {} };
            }, versionTable);

            if (!versionData?.title) {
                Logger.warn("Could not parse version data.");
                return [];
            }

            if (versionData.imageUrl) {
                await this.downloadImage(versionData.imageUrl, `${this.imageOutputPath}/current-banner.png`);
            }
            return [{
                title: versionData.title,
                releaseDate: versionData.releaseDate,
                url: versionData.url
            }];

        });

        [this.versionInfo] = versionInfo;
        this.isNewVersion = await this.service.updateVersion(this.documentID, versionInfo[0]);
    }

}
