import assert from "node:assert/strict";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { BrowserSource } from "../sync/browser-source";
import { extractEvents, extractFgoEvents, extractVersion } from "../sync/extract";

// Local synthetic fixtures exercise the actual browser DOM, not a mocked page.evaluate.
const server = createServer((request, response) => {
    if (request.url === "/denied") { response.writeHead(403); response.end("Denied"); return; }
    if (request.url === "/recovering") {
        response.writeHead(403, {"Content-Type": "text/html"});
        response.end('<title>Loading</title><body>Preparing the page<script>setTimeout(() => location.replace("/recovered"), 20)</script></body>');
        return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><title>Fixture schedules</title><main class="mw-parser-output">
      <h2>Version History</h2><table><tr><th>Version</th><th>Release Date</th></tr>
      <tr><td><a href="/version" title="Current version">Current version</a></td><td>2026-11-11</td></tr>
      <tr><td>Unreleased</td><td>2026-12-11</td></tr></table>
      <h2>Events</h2><table><tr><th>Title</th><th>Period</th><th>Server</th></tr>
      <tr><td><a href="/festival">Lantern Festival</a></td><td rowspan="2">2026-11-20 – 2026-12-02</td><td>EN</td></tr>
      <tr><td>Other region</td><td>CN</td></tr>
      <tr><td>Next event</td><td>2026-12-10 – 2026-12-18</td><td>EN</td></tr></table>
      <h2>Current Banners</h2><table><tr><th>Type</th><th>Warps</th></tr>
      <tr><th colspan="2">Version 1.5: November 11, 2026 — December 2, 2026</th></tr>
      <tr><td>Character</td><td><a href="/banner-one">Banner One</a><a href="/banner-two">Banner Two</a></td></tr>
      <tr><th colspan="2">Since July 1, 2026 (Indefinite)</th></tr>
      <tr><td>Standard</td><td><a href="/standard">Standard Banner</a></td></tr></table>
      <h2><a href="/campaign">Current campaign (US)</a></h2><p>Duration: November 20, 2026 ~ December 3, 2026 PST</p>
      <h2>Past campaign (US)</h2><p>Duration: June 12, 2026 ~ July 2, 2026 PDT</p>
      </main>`);
});
await new Promise<void>((resolve) => { server.listen(0, "127.0.0.1", resolve); });
const address = server.address();
assert.ok(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const waits: Array<number> = [];
const browser = new BrowserSource(true, 45_000, {pause: async milliseconds => {waits.push(milliseconds);await Promise.resolve();}});
try {
    const page = await browser.read(origin);
    const now = new Date("2026-11-21T18:00:00Z");
    assert.equal(extractVersion(page, now).title, "Current version");
    const { events } = extractEvents({...page, tables: page.tables.slice(0, 2)}, "Events", now);
    assert.deepEqual(events.map(event => event.title), ["Lantern Festival", "Next event"]);
    assert.equal(events[0].url, `${origin}/festival`);
    assert.equal(page.tables[1].rows[1][1].text, "2026-11-20 – 2026-12-02");
    assert.equal(page.tables[1].rows[1][2].text, "CN");
    const banners = extractEvents({...page, tables: [page.tables[2]]}, "Banners", now);
    assert.deepEqual(banners.events.map(event => event.title), ["Banner One", "Banner Two"]);
    assert.equal(banners.undated, 0);
    assert.deepEqual(extractFgoEvents(page, now).events.map(event => event.title), ["Current campaign (US)"]);
    assert.equal(await browser.read(origin), page);
    assert.deepEqual(waits, [10_000], "A cached read must not wait or navigate again.");
    await assert.rejects(browser.read(`${origin}/denied`), /HTTP 403/);
    // A failed source must not poison the shared browser for subsequent sources.
    assert.equal((await browser.read(`${origin}/another`)).title, "Fixture schedules");
    assert.equal(waits.length, 5);
    for (const index of [1, 3]) {assert.ok(waits[index] >= 10_000 && waits[index] <= 30_000);}
    assert.equal(waits[2], 10_000);
    assert.equal(waits[4], 10_000);
    const recovery = new BrowserSource(true, 45_000, {pause: async () => {await delay(300);}});
    try {
        assert.equal((await recovery.read(`${origin}/recovering`)).title, "Fixture schedules",
            "An initial 403 must not prevent a successful navigation during the page wait.");
    } finally {await recovery.close();}
    console.log("PASS Playwright parser fixtures: version selection, dated schedules, rowspan, server filtering, relative links, caching and source failure isolation.");
} finally {
    try { await browser.close(); } finally { await new Promise<void>((resolve, reject) => { server.close((error) => { if (error) { reject(error); } else { resolve(); } }); }); }
}
