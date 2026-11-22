import { mkdir, open, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { SchemaValidator } from "../services/schema-validator";
import { DataService } from "../services/data-service";
import { GAME_PROFILES } from "./game-profiles";
import { BrowserSource } from "./browser-source";
import { GameSync, jsonSource } from "./game-sync";
import type { DataFile } from "@shared-lib/types";
import type { GameReport } from "./types";

export type Options = { games: Array<string>; dryRun: boolean; months: number; now: Date; report: string; headless: boolean; browser: "chrome" | "chromium" };
export function parseOptions (args: Array<string>): Options {
    const mode = process.env["PARSER_HEADLESS"] ?? "true";
    if (!["true", "false"].includes(mode)) {throw new Error("PARSER_HEADLESS must be true or false.");}
    const options: Options = { games: [], dryRun: false, months: 2, now: new Date(), report: resolve("tmp/parser-sync/report.json"), headless: mode === "true", browser: "chrome" };
    for (let index = 0; index < args.length; index++) {
        const [key, inline] = args[index].split("=", 2);
        if (key === "--dry-run") { options.dryRun = true; continue; }
        if (key === "--headed") { options.headless = false; continue; }
        if (key === "--headless") { options.headless = true; continue; }
        if (!["--game", "--months", "--at", "--report", "--browser"].includes(key)) { throw new Error(`Unknown option ${key}.`); }
        const value = inline ?? args[++index];
        if (!value || value.startsWith("--")) { throw new Error(`Missing value for ${key}.`); }
        if (key === "--game") { options.games.push(...value.split(",")); }
        if (key === "--months") { options.months = Number(value); }
        if (key === "--at") { options.now = new Date(value); }
        if (key === "--report") { options.report = resolve(value); }
        if (key === "--browser") {
            if (value !== "chrome" && value !== "chromium") {throw new Error("--browser must be chrome or chromium.");}
            options.browser = value;
        }
    }
    if (!Number.isFinite(options.now.getTime()) || !Number.isInteger(options.months) || options.months < 1 || options.months > 12) { throw new Error("Invalid --at date or --months (1–12)."); }
    for (const game of options.games) { if (!GAME_PROFILES.some(profile => profile.id === game)) { throw new Error(`Unsupported game ${game}; FFXIV is intentionally excluded.`); } }
    return options;
}

export async function runCli (args = process.argv.slice(2)): Promise<number> {
    const options = parseOptions(args);
    const executablePath = process.env["PARSER_BROWSER_EXECUTABLE"] ?? (options.browser === "chrome" ? await puppeteer.executablePath() : globalThis.undefined);
    const configFolder = fileURLToPath(new URL("../../config/", import.meta.url));
    const configs: Map<string, DataFile> = new Map();
    const errors: Array<string> = [];
    for (const name of (await readdir(configFolder)).filter(name => name.endsWith(".json")).sort()) {
        try {
            const parsed: unknown = JSON.parse(await readFile(resolve(configFolder, name), "utf8"));
            if (!SchemaValidator.validate(parsed as DataFile)) { throw new Error("Configuration does not match the schema."); }
            const config = parsed as DataFile;
            if (configs.has(config.id)) { throw new Error(`Duplicate game configuration: ${config.id}.`); }
            if (!GAME_PROFILES.some(profile => profile.name === config.id)) { throw new Error(`Unsupported configuration ${config.id}.`); }
            configs.set(config.id, config);
        } catch (error) { errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    const profiles = GAME_PROFILES.filter(profile => !options.games.length || options.games.includes(profile.id));
    await mkdir(dirname(options.report), { recursive: true });
    const lockPath = process.env["PARSER_LOCK_PATH"] ?? fileURLToPath(new URL("../../.weekly-sync.lock", import.meta.url));
    const lock = await open(lockPath, "wx").catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") { throw error; }
        throw new Error("Another parser job is running, or .weekly-sync.lock remains from an interrupted run. Check the recorded PID before removing it.");
    });
    await lock.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
    const browser = new BrowserSource(options.headless, 45_000, {
        executablePath, diagnosticsDirectory: join(dirname(options.report), "browser-errors"),
        snapshotsDirectory: join(dirname(options.report), "source-pages"),
    });
    const reports: Array<GameReport> = [];
    let interrupted = false;
    const stop = () => { interrupted = true; browser.close().catch((error) => { console.error("Browser shutdown failed:", String(error)); }); };
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    try {
        for (const profile of profiles) {
            if (interrupted) { break; }
            const config = configs.get(profile.name);
            if (!config?.sourceList.some(source => source.id === "Version")) { errors.push(`${profile.name}: a Version source is required.`); continue; }
            let service: DataService | undefined;
            try {
                if (!options.dryRun) { service = new DataService(); await service.connect(); }
                const report = await new GameSync(profile, config, { read: async url => browser.read(url), json: jsonSource, service }).run(options.now, options.months);
                reports.push(report);
                console.log(`${report.status.toUpperCase()} ${profile.name}: ${report.recurring} recurring, ${report.dynamic} dynamic; version ${report.version?.title ?? "unavailable"}`);
            } catch (error) { errors.push(`${profile.name}: ${error instanceof Error ? error.message : String(error)}`); } finally { await service?.disconnect().catch((error) => { errors.push(`${profile.name}: disconnect failed: ${String(error)}`); }); }
        }
    } finally {
        try { await browser.close(); } finally {
            process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
            await lock.close(); await unlink(lockPath);
        }
    }
    const success = !interrupted && !errors.length && reports.length === profiles.length && reports.every(report => report.status === "ok");
    await writeFile(options.report, JSON.stringify({
        startedFor: options.now.toISOString(),
        finished: new Date().toISOString(),
        months: options.months,
        dryRun: options.dryRun,
        headless: options.headless,
        browser: process.env["PARSER_BROWSER_EXECUTABLE"] ? "custom executable" : options.browser,
        success,
        interrupted,
        errors,
        games: reports
    }, null, 2));
    console.log(`Report: ${options.report}`);
    return success ? 0 : interrupted ? 130 : 1;
}
