import type { DataFile, Event, Version } from "@lib/types";
import type { EventExtraction } from "./extract";
import { readSource } from "./source-adapters";
import { recurringEvents } from "./recurring-events";
import type { GameProfile, GameReport, ImportService, SourcePage } from "./types";

type Dependencies = {
    read: (url: string) => Promise<SourcePage>;
    json: (url: string) => Promise<unknown>;
    service?: ImportService;
};
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
                const result = await readSource(this.profile, source, now, this.dependencies);
                if (result.version) {version = result.version;}
                events = result.events;
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
