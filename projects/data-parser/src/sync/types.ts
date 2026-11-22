import type { Event, Version } from "@shared-lib/types";

export type Recurrence = {
    title: string;
    url: string;
    cadence: "daily" | "weekly" | "monthly";
    day?: number;
    eventType: Event["eventType"];
};
export type GameProfile = {
    id: string;
    name: string;
    offsetMinutes: number;
    resetHour: number;
    recurring: Array<Recurrence>;
};
export type Link = { text: string; url: string; title: string };
export type Cell = { text: string; links: Array<Link> };
export type SourcePage = { url: string; title: string; text: string; links: Array<Link>;
    sections?: Array<{heading: string; text: string; links: Array<Link>}>; tables: Array<{
    heading: string; headers: Array<string>; rows: Array<Array<Cell>>; periods?: Array<string>;
}> };
export type SkippedRow = {title: string; period: string; reason: string};
export type SourceOutcome = { id: string; url: string; status: "ok" | "failed"; count: number; error?: string; skipped?: Array<SkippedRow> };
export type GameReport = { game: string; name: string; status: "ok" | "failed"; version?: Version; events?: Array<Event>; recurring: number; dynamic: number; sources: Array<SourceOutcome>; errors: Array<string> };
export type ImportService = {
    addRecords: (name: string, topic: string, records: Array<Event>) => Promise<void>;
    updateVersion: (name: string, version: Version) => Promise<boolean>;
    disconnect: () => Promise<void>;
};
