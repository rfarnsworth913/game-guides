import type { DataSource, Version } from '@lib/types';
import type { GameProfile, SourcePage } from './types';
import { datesIn, extractEvents, extractFgoEvents, extractGf2Banners, extractNoticeEvents, extractVersion, type EventExtraction } from './extract';

export type SourceDependencies = {
    read: (url: string) => Promise<SourcePage>;
    json: (url: string) => Promise<unknown>;
};
const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {throw new Error('Expected a JSON object.');}
    return value as Record<string, unknown>;
};
const string = (value: unknown): string => typeof value === 'string' ? value : '';

/** Source-specific extraction; scheduling, persistence and run outcomes belong to GameSync. */
export async function readSource(profile: GameProfile, source: DataSource, now: Date, dependencies: SourceDependencies): Promise<{version: Version | null; events: EventExtraction | null}> {
    let version: Version | null = null;
    let events: EventExtraction | null = null;
    if (new URL(source.url).hostname === "itunes.apple.com") {
        const data = object(await dependencies.json(source.url));
        const app = object(Array.isArray(data["results"]) ? data["results"][0] : null);
        const title = string(app["version"]);
        const releaseDate = string(app["currentVersionReleaseDate"]).slice(0, 10);
        if (!title || !datesIn(releaseDate, now.getUTCFullYear()).length || releaseDate > now.toISOString().slice(0, 10)) {
            throw new Error("App Store version metadata is incomplete or unreleased.");
        }
        version = { title, releaseDate, url: string(app["trackViewUrl"]) || source.url };
    } else if (new URL(source.url).hostname === "api.steampowered.com") {
        const data = object(object(await dependencies.json(source.url))["appnews"]);
        const posts = Array.isArray(data["newsitems"]) ? data["newsitems"].map(object) : [];
        const published = posts.filter(post => Number(post["date"]) * 1000 <= now.getTime()).sort((a, b) => Number(b["date"]) - Number(a["date"]));
        const patch = published.find(post => (/update contents|patch notes|version\s+\d/i).test(string(post["title"])));
        if (!patch) { throw new Error("No published game update found in the official Steam feed."); }
        version = { title: string(patch["title"]), releaseDate: new Date(Number(patch["date"]) * 1000).toISOString().slice(0, 10), url: string(patch["url"]) };
        // The publisher feed identifies releases. Dated event/banner tables
        // are separate required sources, not inferred from arbitrary news text.
    } else if (profile.id === "nte") {
        const index = await dependencies.read(source.url);
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
            const page = await dependencies.read(link.url);
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
        const page = await dependencies.read(source.url.replace("{year}", String(now.getUTCFullYear())));
        if (source.id === "Version") { version = extractVersion(page, now); }
        else if (profile.id === "gf2" && source.id === "Banners") {events = extractGf2Banners(page, now);}
        else if (profile.id === "fgo" && source.id === "Events") {events = extractFgoEvents(page, now);}
        else { events = extractEvents(page, source.id, now); }
    }
    return { version, events };
}
