import type { DataFile, Event, Version } from "@shared-lib/types";
import { datesIn, type EventExtraction, extractEvents, extractFgoEvents, extractGf2Banners, extractNoticeEvents, extractVersion } from "./extract";
import { recurringEvents } from "./recurring-events";
import type { GameProfile, GameReport, ImportService, SourcePage } from "./types";

type Dependencies = {
    read: (url: string) => Promise<SourcePage>;
    json: (url: string) => Promise<unknown>;
    service?: ImportService;
};
const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) { throw new Error("Expected a JSON object."); }
    return value as Record<string, unknown>;
};
const string = (value: unknown): string => (typeof value === "string" ? value : "");

export async function jsonSource (url: string): Promise<unknown> {
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { Accept: "application/json" } });
            if (!response.ok) { throw new Error(`HTTP ${response.status} at ${url}.`); }
            return await response.json() as unknown;
        } catch (error) {
            last = error;
            if (attempt < 2) { await new Promise((resolve) => { setTimeout(resolve, 1000 * (attempt + 1)); }); }
        }
    }
    throw last;
}

/** All adapters use the same staged, non-destructive import and explicit per-source outcomes. */
export class GameSync {
    constructor (private readonly profile: GameProfile, private readonly config: DataFile, private readonly dependencies: Dependencies) {}

    async run (now: Date, months = 2): Promise<GameReport> {
        const report: GameReport = { game: this.profile.id, name: this.profile.name, status: "ok", recurring: 0, dynamic: 0, sources: [], errors: [] };
        const scheduled = recurringEvents(this.profile, now, months);
        const dynamic: Array<Event> = [];
        let version: Version | null = null;
        const sources = [...new Map(this.config.sourceList.map(source => [`${source.id}\n${source.url}`, source])).values()];
        for (const source of sources) {
            let events: EventExtraction | null = null;
            try {
                if (new URL(source.url).hostname === "itunes.apple.com") {
                    const data = object(await this.dependencies.json(source.url));
                    const app = object(Array.isArray(data["results"]) ? data["results"][0] : null);
                    const title = string(app["version"]);
                    const releaseDate = string(app["currentVersionReleaseDate"]).slice(0, 10);
                    if (!title || !datesIn(releaseDate, now.getUTCFullYear()).length || releaseDate > now.toISOString().slice(0, 10)) {
                        throw new Error("App Store version metadata is incomplete or unreleased.");
                    }
                    version = { title, releaseDate, url: string(app["trackViewUrl"]) || source.url };
                } else if (new URL(source.url).hostname === "api.steampowered.com") {
                    const data = object(object(await this.dependencies.json(source.url))["appnews"]);
                    const posts = Array.isArray(data["newsitems"]) ? data["newsitems"].map(object) : [];
                    const published = posts.filter(post => Number(post["date"]) * 1000 <= now.getTime()).sort((a, b) => Number(b["date"]) - Number(a["date"]));
                    const patch = published.find(post => (/update contents|patch notes|version\s+\d/i).test(string(post["title"])));
                    if (!patch) { throw new Error("No published game update found in the official Steam feed."); }
                    version = { title: string(patch["title"]), releaseDate: new Date(Number(patch["date"]) * 1000).toISOString().slice(0, 10), url: string(patch["url"]) };
                    // The publisher feed identifies releases. Dated event/banner tables
                    // are separate required sources, not inferred from arbitrary news text.
                } else if (this.profile.id === "nte") {
                    const index = await this.dependencies.read(source.url);
                    const links = [...new Map(index.links.filter(link => {
                        const address = new URL(link.url);
                        return address.hostname === "nte.perfectworld.com"
                            && (/^\/en\/article\/news\/[^/]+\/20\d{6}\/[^/]+\.html$/).test(address.pathname);
                    }).map(link => [link.url, link])).values()]
                        .sort((a, b) => (b.url.match(/\/(20\d{6})\//)?.[1] ?? "").localeCompare(a.url.match(/\/(20\d{6})\//)?.[1] ?? "")).slice(0, 30);
                    if (!links.length) { throw new Error("No official news articles found; check the NTE news index URL."); }
                    const parsed: Array<EventExtraction> = [];
                    const versions: Array<Version> = [];
                    for (const link of links) {
                        const page = await this.dependencies.read(link.url);
                        const publishedText = link.url.match(/\/(20\d{2})(\d{2})(\d{2})\//);
                        const published = publishedText ? new Date(`${publishedText[1]}-${publishedText[2]}-${publishedText[3]}T00:00:00Z`) : now;
                        parsed.push(extractNoticeEvents(page.text, page.url, published, now));
                        const title = page.title.match(/(?:Version|Ver\.)\s+\d+\.\d+[^\n]*/i)?.[0]?.split(/-NTE\s*\(/)[0].trim();
                        const maintenance = page.text.split("\n").find(line => (/maintenance period:|will undergo maintenance/i).test(line));
                        const releaseDate = datesIn(maintenance ?? "", published.getUTCFullYear())[0];
                        if (title && releaseDate && releaseDate <= now.toISOString().slice(0, 10)) { versions.push({ title, releaseDate, url: page.url }); }
                    }
                    if (source.id === "Version") {
                        version = versions.sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)))[0] ?? null;
                        if (!version) { throw new Error("No released NTE version found in official patch notices."); }
                    }
                    events = { events: parsed.flatMap(item => item.events), undated: parsed.reduce((sum, item) => sum + item.undated, 0), recognizedTables: parsed.reduce((sum, item) => sum + item.recognizedTables, 0), skipped: parsed.flatMap(item => item.skipped ?? []) };
                } else {
                    const page = await this.dependencies.read(source.url.replace("{year}", String(now.getUTCFullYear())));
                    if (source.id === "Version") { version = extractVersion(page, now); }
                    else if (this.profile.id === "gf2" && source.id === "Banners") {events = extractGf2Banners(page, now);}
                    else if (this.profile.id === "fgo" && source.id === "Events") {events = extractFgoEvents(page, now);}
                    else { events = extractEvents(page, source.id, now); }
                }
                if (events) {
                    if (!events.recognizedTables) { throw new Error("No event schedule recognized; stored events were not cleared."); }
                    if (!events.events.length && events.undated) { throw new Error(`${events.undated} event rows have missing or invalid dates; no reliable schedule extracted.`); }
                    if (events.undated) { report.status = "failed"; report.errors.push(`${source.id}: ${events.undated} undated/invalid rows omitted; dates must be confirmed.`); }
                    dynamic.push(...events.events);
                }
                report.sources.push({ id: source.id, url: source.url, status: "ok", count: events?.events.length ?? (version ? 1 : 0), skipped: events?.skipped });
            } catch (error) {
                report.sources.push({ id: source.id, url: source.url, status: "failed", count: 0, error: error instanceof Error ? error.message : String(error), skipped: events?.skipped });
                report.status = "failed";
            }
        }
        if (!version) { report.status = "failed"; report.errors.push("Current version could not be confirmed; previous version remains unchanged."); }
        const events = [...new Map([...scheduled, ...dynamic].map(event => [JSON.stringify([event.title, event.startDate, event.endDate]), event])).values()];
        report.recurring = scheduled.length;
        report.dynamic = events.length - scheduled.length;
        report.version = version ?? globalThis.undefined;
        report.events = events;
        if (this.dependencies.service) {
            try {
                if (version) { await this.dependencies.service.updateVersion(this.profile.name, version); }
                if (events.length) { await this.dependencies.service.addRecords(this.profile.name, "events", events); }
            } catch (error) {
                report.status = "failed"; report.errors.push(error instanceof Error ? error.message : String(error));
            }
        }
        return report;
    }
}
