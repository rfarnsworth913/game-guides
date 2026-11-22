import { createHash, randomInt } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { type Browser, type Response, chromium } from "playwright";
import type { SourcePage } from "./types";

type BrowserOptions = {
    diagnosticsDirectory?: string;
    snapshotsDirectory?: string;
    executablePath?: string;
    /** Injectable wait keeps fixture tests fast while exercising production pacing. */
    pause?: (milliseconds: number) => Promise<void>;
};

/** One isolated browser for a job; each source gets its own page and a bounded timeout. */
export class BrowserSource {
    private browser?: Browser;
    private navigated = false;
    private readonly cache: Map<string, SourcePage> = new Map();
    private readonly pause: (milliseconds: number) => Promise<void>;
    constructor (private readonly headless = true, private readonly timeout = 45_000, private readonly options: BrowserOptions = {}) {
        this.pause = options.pause ?? (async milliseconds => {await delay(milliseconds);});
    }
    async read (url: string): Promise<SourcePage> {
        const saved = this.cache.get(url);
        if (saved) { return saved; }
        if (this.navigated) {await this.pause(randomInt(10_000, 30_001));}
        this.browser ??= await chromium.launch({ headless: this.headless, executablePath: this.options.executablePath });
        const context = await this.browser.newContext();
        try {
            // tsx preserves function names using this helper inside serialized callbacks.
            await context.addInitScript("globalThis.__name = (value) => value;");
            const page = await context.newPage();
            let response: Response | null = null;
            page.on("response", incoming => {
                if (incoming.request().isNavigationRequest() && incoming.frame() === page.mainFrame()) {response = incoming;}
            });
            this.navigated = true;
            response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: this.timeout });
            // Wait even for an initial error response: the page can subsequently navigate.
            await this.pause(10_000);
            if (!response?.ok()) {
                const title = await page.title();
                const body = (await page.locator("body").innerText({timeout: this.timeout}).catch(() => "")).replace(/\s+/g, " ").slice(0, 400);
                let diagnostic = "";
                if (this.options.diagnosticsDirectory) {
                    try {
                        await mkdir(this.options.diagnosticsDirectory, {recursive: true});
                        const name = `${new URL(url).hostname}-${createHash("sha256").update(url).digest("hex").slice(0, 12)}`;
                        const path = join(this.options.diagnosticsDirectory, name);
                        await page.screenshot({path: `${path}.png`});
                        await writeFile(`${path}.html`, await page.content());
                        diagnostic = ` Diagnostics: ${path}.png and .html.`;
                    } catch (error) {diagnostic = ` Diagnostic capture failed: ${String(error)}.`;}
                }
                throw new Error(`HTTP ${response?.status() ?? "unknown"} at ${page.url()} after the 10-second page wait. Title: ${title}. ${body}${diagnostic}`);
            }
            await page.waitForFunction(() => document.body?.innerText.trim().length > 50, null, { timeout: this.timeout });
            const data = await page.evaluate(() => {
                const root = location.hostname === "game8.co"
                    ? document.querySelector("#archive-style-wrapper, .archive-style-wrapper") ?? document.body
                    : document.querySelector(".mw-parser-output, .archive-style-wrapper") ?? document.querySelector("main") ?? document.querySelector("article") ?? document.body;
                const links = (element: Element) => [...element.querySelectorAll<HTMLAnchorElement>("a[href]:not(.image)")]
                    .map(link => ({ text: link.textContent?.trim() ?? "", title: link.title, url: link.href }));
                const headings = [...root.querySelectorAll("h1,h2,h3,h4")];
                const tables = [...root.querySelectorAll("table")].map((table) => {
                    const heading = headings.filter(item => item.compareDocumentPosition(table) % 8 >= Node.DOCUMENT_POSITION_FOLLOWING).at(-1)?.textContent ?? "";
                    let headers: Array<string> = [];
                    let period = "";
                    const periods: Array<string> = [];
                    const rows: Array<Array<{ text: string; links: Array<{ text: string; title: string; url: string }> }>> = [];
                    const spans: Map<number, { remaining: number; cell: { text: string; links: Array<{ text: string; title: string; url: string }> } }> = new Map();
                    for (const row of [...table.rows]) {
                        if (row.closest("table") !== table) { continue; }
                        if (row.cells.length === 1 && row.cells[0].tagName === "TH" && row.cells[0].colSpan > 1) {
                            const text = row.cells[0].textContent?.trim() ?? "";
                            if ((/\b20\d{2}[-/]|January|February|March|April|May|June|July|August|September|October|November|December/i).test(text)) {
                                period = text;
                            }
                            continue;
                        }
                        if ([...row.cells].every(cell => cell.tagName === "TH") && row.cells.length > 1) {
                            headers = [...row.cells].flatMap(cell => Array.from({ length: cell.colSpan }, () => cell.textContent?.trim() ?? "")); continue;
                        }
                        const values: Array<{ text: string; links: Array<{ text: string; title: string; url: string }> }> = [];
                        let column = 0;
                        const carry = () => {
                            while (spans.has(column)) {
                                const span = spans.get(column)!;
                                values.push(span.cell); span.remaining--; if (!span.remaining) { spans.delete(column); }column++;
                            }
                        };
                        for (const cell of [...row.cells]) {
                            carry();
                            const value = { text: cell.innerText.trim(), links: links(cell) };
                            for (let i = 0; i < cell.colSpan; i++) {
                                values.push(value);
                                if (cell.rowSpan > 1) { spans.set(column, { remaining: cell.rowSpan - 1, cell: value }); }
                                column++;
                            }
                        }
                        carry();
                        if (values.length) { rows.push(values); periods.push(period); }
                    }
                    return { heading, headers, rows, periods };
                });
                const sections = headings.map(heading => {
                    const anchor = heading.parentElement?.classList.contains("mw-heading") ? heading.parentElement : heading;
                    const text: Array<string> = [];
                    for (let sibling = anchor.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
                        if (sibling.matches("h1,h2,h3,h4,.mw-heading") || sibling.querySelector("h1,h2,h3,h4")) {break;}
                        text.push((sibling as HTMLElement).innerText ?? sibling.textContent ?? "");
                    }
                    return {heading: heading.textContent?.trim() ?? "", text: text.join("\n"), links: links(heading)};
                });
                return { url: location.href, title: document.title, text: (root as HTMLElement).innerText, links: links(root), tables, sections };
            });
            if ((/just a moment|access denied|verify (?:you|that).*human/i).test(data.title)) { throw new Error(`Source blocked browser access at ${url}.`); }
            if (this.options.snapshotsDirectory) {
                await mkdir(this.options.snapshotsDirectory, {recursive: true});
                const name = createHash("sha256").update(url).digest("hex");
                await writeFile(join(this.options.snapshotsDirectory, `${name}.json`), JSON.stringify({
                    requestedUrl: url, fetchedAt: new Date().toISOString(), browserVersion: this.browser.version(), page: data,
                }));
            }
            this.cache.set(url, data);
            return data;
        } finally { await context.close(); }
    }

    async close (): Promise<void> {
        await this.browser?.close(); this.browser = globalThis.undefined; this.navigated = false;
    }
}
