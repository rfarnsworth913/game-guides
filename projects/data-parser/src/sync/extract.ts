import { EventType } from "@lib/enums";
import type { Event, Version } from "@lib/types";
import type { Link, SkippedRow, SourcePage } from "./types";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const iso = (year: number, month: number, day: number): string | null => {
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
};

/** Extracts explicit dates, including wiki ranges with one shared year. Unknown dates stay unknown. */
export function datesIn (text: string, year: number): Array<string> {
    // Some wiki cards omit the separator between a numeric date and its clock.
    const datedText = text
        .replace(/\b(20\d{2}[-/]\d{1,2}[-/])(\d{1,2})([0-2]\d:[0-5]\d)\b/g, "$1$2 $3")
        .replace(/([a-z])(January|February|March|April|May|June|July|August|September|October|November|December)(?=\s+\d)/g, "$1 $2");
    const result: Array<string> = [];
    const sharedYear = Number(text.match(/\b(20\d{2})\b/)?.[1] ?? year);
    const regex = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b|\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b|\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(20\d{2}))?\b/gi;
    for (const match of datedText.matchAll(regex)) {
        const month = match[4] ? MONTHS.indexOf(match[4].slice(0, 3).toLowerCase()) + 1
            : match[8] ? MONTHS.indexOf(match[8].slice(0, 3).toLowerCase()) + 1 : Number(match[2]);
        let dateYear = Number(match[1] ?? match[6] ?? match[9] ?? sharedYear);
        if (result.length && !match[1] && !match[6] && !match[9] && month < Number(result.at(-1)!.slice(5, 7))) { dateYear++; }
        const value = iso(dateYear, month, Number(match[3] ?? match[5] ?? match[7]));
        if (value) { result.push(value); }
    }
    // When only the end supplies its year (Dec 30 – Jan 3, 2027), anchor backwards.
    const matches = [...datedText.matchAll(regex)];
    if (matches.length === 2 && result.length === 2 && !matches[0][1] && !matches[0][6] && !matches[0][9]
        && (matches[1][1] || matches[1][6] || matches[1][9]) && result[0] > result[1]) {
        result[0] = `${Number(result[1].slice(0, 4)) - 1}${result[0].slice(4)}`;
    }
    // A range such as "November 1–12, 2026" shares its month as well as its year.
    if (result.length === 1) {
        const day = text.match(/\b(?:Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)\.?\s+\d{1,2}\s*[–—~-]\s*(\d{1,2})(?:,|\s|$)/i)?.[1];
        const value = day ? iso(Number(result[0].slice(0, 4)), Number(result[0].slice(5, 7)), Number(day)) : null;
        if (value) { result.push(value); }
    }
    return result;
}

const articleLink = (links: Array<Link>): Link | undefined => links.find(link => (/^https?:\/\//).test(link.url) && link.text.trim() && !(/[?&]action=/i).test(link.url) && !(/(?:\/wiki\/|[?&]title=)(?:File|Image|Category|Special):/i).test(link.url));
const classify = (text: string, source: string): EventType => {
    if ((/\b(?:banners?|wishes|wish|warps?|summon(?:ing)?|channels?|procurement|boards?|arc research|limited.*(?:class character|class arc)|character rerun|arc rerun)\b/i).test(`${source} ${text}`)) { return EventType.Banner; }
    if ((/battle pass|miliastra pass|circle bounty|voyage logs|arclight logs/i).test(text)) { return EventType.BattlePass; }
    if ((/apocalyptic|pure fiction|forgotten hall|memory of chaos|anomaly arbitration|shiyu|deadly assault|tower of adversity|whimpering wastes|doubled pawns|endstate matrix|stygian onslaught/i).test(`${source} ${text}`)) { return EventType.EndGame; }
    if ((/heated battle|forge realm|genius invokation|\bTCG\b/i).test(text)) {return EventType.TCG;}
    if ((/web event|fan creation|fanart|community event/i).test(text)) { return EventType.Web; }
    return EventType.Temporary;
};

/** Selects the latest released version, never a future announcement or the first arbitrary link. */
export function extractVersion (page: SourcePage, now: Date): Version {
    const candidates: Array<{ version: Version; date: string }> = [];
    for (const table of page.tables) {
        if (!(/version|release|patch/i).test(`${table.heading} ${table.headers.join(" ")}`)) { continue; }
        const dateIndex = table.headers.findIndex(header => (/release|launch|date/i).test(header));
        const titleIndex = table.headers.findIndex(header => (/^(?:name|title|event|version name)$/i).test(header.trim()));
        for (const row of table.rows) {
            const dates = datesIn((dateIndex >= 0 ? row[dateIndex]?.text : row.map(cell => cell.text).join(" ")) ?? "", now.getUTCFullYear());
            const releaseDate = dates[0];
            if (!releaseDate || releaseDate > now.toISOString().slice(0, 10)) { continue; }
            const nameIndex = titleIndex >= 0 ? titleIndex : table.headers.length >= 3 && dateIndex === 2 ? 1 : 0;
            const cell = row[nameIndex];
            const link = articleLink(cell?.links ?? []);
            const name = (link?.text || cell?.text || link?.title || "").trim();
            const number = nameIndex > 0 ? row[0]?.text.trim() : "";
            const title = number && (/^\d+(?:\.\d+)+$/).test(number) ? `${number}: ${name}` : name;
            if (!title) { continue; }
            candidates.push({ version: { title, url: link?.url ?? page.url, releaseDate }, date: releaseDate });
        }
    }
    const version = candidates.sort((a, b) => b.date.localeCompare(a.date))[0]?.version;
    if (!version) { throw new Error(`No released version with a valid release date found at ${page.url}.`); }
    return version;
}

export type EventExtraction = { events: Array<Event>; undated: number; recognizedTables: number; skipped?: Array<SkippedRow> };

/** FGO's ongoing US events are heading cards, not the historical tables below them. */
export function extractFgoEvents(page: SourcePage, now: Date): EventExtraction {
    const result: EventExtraction = {events: [], undated: 0, recognizedTables: 0};
    for (const section of page.sections ?? []) {
        const period = section.text.split("\n").find(line => (/^\s*Duration\s*:/i).test(line));
        if (!period) {continue;}
        result.recognizedTables++;
        const dates = datesIn(period, now.getUTCFullYear());
        const title = section.heading.replace(/\[edit\]/gi, "").trim();
        if (dates.length < 2 || dates[1] < dates[0]) {
            result.undated++; (result.skipped ??= []).push({title, period, reason: "Missing or invalid start/end dates"});continue;
        }
        if (dates[1] < now.toISOString().slice(0, 10)) {continue;}
        result.events.push({title, url: articleLink(section.links)?.url ?? page.url, startDate: dates[0], endDate: dates[1], eventType: classify(title, "Events")});
    }
    return result;
}

/** IOP's banner history uses dated text cards, with separate CN and EN sections. */
export function extractGf2Banners(page: SourcePage, now: Date): EventExtraction {
    const result: EventExtraction = {events: [], undated: 0, recognizedTables: 0};
    const lines = page.text.split("\n").map(line => line.trim()).filter(Boolean);
    const english = lines.indexOf("EN");
    if (english < 0) {return result;}
    result.recognizedTables = 1;
    let year = now.getUTCFullYear();
    const startsDate = /^(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|Jan\w* |Feb\w* |Mar\w* |Apr\w* |May |Jun\w* |Jul\w* |Aug\w* |Sep\w* |Oct\w* |Nov\w* |Dec\w* )/;
    for (let index = english + 1; index < lines.length; index++) {
        if ((/^20\d{2}$/).test(lines[index])) {year = Number(lines[index]);continue;}
        if (!startsDate.test(lines[index])) {continue;}
        const dates = datesIn(lines[index], year);
        if (dates.length >= 2 && dates.every(date => date < now.toISOString().slice(0, 10))) {continue;}
        const details: Array<string> = [];
        for (let next = index + 1; next < Math.min(index + 5, lines.length); next++) {
            if (startsDate.test(lines[next])) {break;}
            details.push(lines[next]);
        }
        const dolls = details.find(line => line.startsWith("Dolls:"))?.replace(/^Dolls:\s*/, "");
        if (!dolls || dates.length < 2 || dates[1] < dates[0]) {
            result.undated++;
            (result.skipped ??= []).push({title: dolls ?? "Unidentified banner", period: lines[index], reason: "Missing title or valid start/end dates"});
            continue;
        }
        if (dates[1] < now.toISOString().slice(0, 10)) {continue;}
        const name = (/Custom Procurement/i).test(details.join(" ")) ? "Custom Procurement" : `${dolls.split(",")[0]} Procurement`;
        result.events.push({title: name, startDate: dates[0], endDate: dates[1], eventType: EventType.Banner, url: page.url});
    }
    return result;
}
/** All published dated rows are inspected; expired rows are excluded from this refresh, not deleted. */
export function extractEvents (page: SourcePage, source: string, now: Date, server = "EN"): EventExtraction {
    const result: EventExtraction = { events: [], undated: 0, recognizedTables: 0 };
    const today = now.toISOString().slice(0, 10);
    const recognized = /\b(?:dates?|duration|period|window|schedule|starts?|ends?|starting|ending)\b/i;
    // Historical version windows can encompass several rotations. Prefer the published current cycle.
    const hasCurrentCycle = classify('', source) === EventType.EndGame && page.tables.some(table =>
        !(/\bhistory\b/i).test(table.heading) && table.headers.some(header => recognized.test(header)) && table.rows.some(row => {
            const dates = datesIn(row.map(cell => cell.text).join(' '), now.getUTCFullYear());
            return dates.length >= 2 && dates[0] <= dates[1] && dates[1] >= today;
        }));
    for (const table of page.tables) {
        if ((/^versions?(?: history)?$/i).test(table.heading.trim())) {continue;}
        if ((/\bpermanent\b/i).test(table.heading)) {continue;}
        if (hasCurrentCycle && (/\bhistory\b/i).test(table.heading)) {continue;}
        if (table.headers.some(header => (/^version$/i).test(header.trim()))) { continue; }
        const dateIndexes = table.headers.flatMap((header, index) => recognized.test(header) ? [index] : []);
        if (!dateIndexes.length && !table.periods?.some(period => datesIn(period, now.getUTCFullYear()).length)) { continue; }
        result.recognizedTables++;
        const serverIndex = table.headers.findIndex(header => (/server|region/i).test(header));
        const titleIndex = table.headers.findIndex(header => (/^(?:event|name|title|banner|warp|wish|board|program|convene)/i).test(header.trim()));
        for (const [rowIndex, row] of table.rows.entries()) {
            if (serverIndex >= 0 && !new RegExp(`\\b(?:${server}|Global|Worldwide|All)\\b`, "i").test(row[serverIndex]?.text ?? "")) { continue; }
            const cell = row[titleIndex >= 0 ? titleIndex : 0];
            const link = articleLink(cell?.links ?? []);
            const title = classify("", source) === EventType.EndGame ? source : (link?.text || cell?.text || "").trim();
            if (!title) { continue; }
            const period = dateIndexes.length ? dateIndexes.map(index => row[index]?.text ?? "").join(" – ") : table.periods?.[rowIndex] ?? "";
            if ((/indefinite|permanent/i).test(period)) { continue; }
            const dates = datesIn(period, now.getUTCFullYear());
            if (dates.length < 2 || dates[1] < dates[0]) {
                result.undated++;
                (result.skipped ??= []).push({title, period, reason: "Missing or invalid start/end dates"});
                continue;
            }
            if (dates[1] < today) { continue; }
            const banners = (/banners/i).test(source) ? (cell?.links.filter(item => articleLink([item])) ?? []) : [];
            for (const entry of banners.length ? banners : [{text: title, url: link?.url ?? page.url}]) {
                result.events.push({
                    title: entry.text, url: entry.url, startDate: dates[0], endDate: dates[1],
                    eventType: classify(`${title} ${table.heading} ${row.map(cell => cell.text).join(" ")}`, source)
                });
            }
        }
    }
    return result;
}

/** Extracts published duration blocks in official patch notices (NTE and Steam publisher notes). */
export function extractNoticeEvents (text: string, url: string, published: Date, now: Date): EventExtraction {
    if ((/^(?:server |asia.*?server )?maintenance notice/i).test(text.trim())) {
        return {events: [], undated: 0, recognizedTables: 0};
    }
    const events: Array<Event> = [];
    let undated = 0;
    let recognized = 0;
    const skipped: Array<SkippedRow> = [];
    const blocks = text.split(/(?=^[●■]|^#{1,4}\s)/m);
    for (const block of blocks) {
        const lines = block.split("\n").map(line => line.trim()).filter(Boolean);
        const title = lines[0]?.replace(/^[●■#\s]+/, "").trim();
        const durationIndex = lines.findIndex(line => (/(?:duration|availability|period|event time|submission)\s*[:：]|^(?:\[|▌)?\s*(?:event duration|available)\s*\]?$/i).test(line));
        const duration = durationIndex >= 0 ? `${lines[durationIndex]} ${lines[durationIndex + 1] ?? ""}` : "";
        if (!title || !duration) { continue; }
        if ((/maintenance period:/i).test(duration)) { continue; }
        if ((/permanent|indefinite/i).test(duration)) { continue; }
        recognized++;
        const dates = datesIn(duration, published.getUTCFullYear());
        if (dates.length < 2 || dates[1] < dates[0]) {
            undated++; skipped.push({title, period: duration, reason: "Missing or invalid start/end dates"}); continue;
        }
        if (dates[1] < now.toISOString().slice(0, 10)) { continue; }
        events.push({ title, url, startDate: dates[0], endDate: dates[1], eventType: classify(title, "Events") });
    }
    return { events, undated, recognizedTables: recognized, skipped };
}
