# Data parsers

The production entry point is `projects/data-parser/src/main.ts`, which calls `src/sync/runner.ts`. The old class-based parsers are not a second production path. A subset remains under `src/legacy/parsers` because its regression tests still exercise behavior that must be reviewed before removal.

## Supported games and ownership

The active profiles in `src/sync/game-profiles.ts` cover eight games:

| Game | CLI identifier |
| --- | --- |
| Arknights: Endfield | `endfield` |
| Fate/Grand Order | `fgo` |
| Genshin Impact | `genshin` |
| Girls Frontline 2 | `gf2` |
| Honkai: Star Rail | `hsr` |
| Neverness to Everness | `nte` |
| Wuthering Waves | `wuwa` |
| Zenless Zone Zero | `zzz` |

Final Fantasy XIV is intentionally excluded. A supported profile does not imply complete dynamic-event or summoning coverage.

| Location | Responsibility |
| --- | --- |
| `config/*.json` | Stable game identity and configured sources; validated before processing |
| `src/sync/game-profiles.ts` | Game-specific recurrence and source selection |
| `src/sync/source-adapters.ts`, `extract.ts` | Source dispatch, version/date/event extraction |
| `src/sync/browser-source.ts` | Playwright navigation, pacing, snapshots and diagnostics |
| `src/sync/recurring-events.ts` | Recurrence generation independent of dynamic-source success |
| `projects/lib/constants/event-schedules.constants.ts` | Configured server offsets/reset times |
| `src/sync/game-sync.ts`, `services/data-service.ts` | Validated reconciliation and persistence |
| `src/sync/run-report.ts`, `runner.ts` | CLI, exclusive job lock, checkpoints and final outcomes |

## Commands

Run from the repository root using the pinned Node version and installed dependencies. A live write requires the configured database and registered game records; do not point previews or automated tests at production unnecessarily.

```sh
# Preview all games without opening a database write connection.
npm run parser:preview -- --headed --report=tmp/parser-sync/preview.json

# Preview a subset with a reproducible reference time.
npm run parser:preview -- --game=genshin,hsr --at=2026-11-24T12:00:00Z --headed

# Live import for the configured games. Back up first.
npm run parser:weekly -- --report=tmp/parser-sync/weekly.json

# Offline checks; no live wiki scraping or production database required.
npm run parser:check
npm run parser:test
npm run parser:browser-test
```

`parser:preview` passes `--dry-run --months=2`; `parser:weekly` passes `--months=2`. `parser:start` is also a live-write command by default. The horizon accepts whole numbers from 1 through 12. Repeated `--game` arguments or comma-separated IDs select games. Other options are `--at`, `--report`, `--headed`, `--headless` and `--browser=chrome|chromium`.

The desktop CLI defaults to headless mode unless `PARSER_HEADLESS=false` or `--headed` is supplied. `--browser=chrome` is the default and uses Puppeteer's installed Chrome executable with Playwright. `--browser=chromium` uses Playwright's browser; `PARSER_BROWSER_EXECUTABLE` can supply an explicit executable. The existing Docker image defaults to headed mode through Xvfb and installs both browser distributions. Do not remove either installation without testing the intended runtime.

The browser waits a random 10-30 seconds between navigations and 10 seconds after opening a page. These waits do not guarantee that protected websites will permit access. A blocked source must be reported as a failure rather than interpreted as an empty list.

## Reports, locks and preservation

The runner defaults to `tmp/parser-sync/report.json` and writes atomic checkpoints after each game. Use timestamped report filenames for operational history. A checkpoint has `complete: false`; final `complete: true` does not imply `success: true`. Inspect source errors and game outcomes as well as the process exit code.

The default lock is `projects/data-parser/.weekly-sync.lock`; `PARSER_LOCK_PATH` overrides it. An interrupted process can leave a lock. Inspect its recorded PID and confirm that no job is running before removing it. A file lock coordinates processes sharing that path, not independent NAS/cloud hosts.

The pipeline preserves existing dynamic/history records when a source fails and uses stable occurrence identities for repeated imports. Valid results can be persisted even if another source fails; a partially successful run still exits nonzero. Back up shared catalogs, account progress and uploaded media before production changes. Normal unit and browser-fixture tests are separate from live-source validation.

Date-only records are displayed from local 00:00 through 23:59 on their labeled dates. Server reset metadata remains provenance for recurrence generation; it does not shift a date-only UI task into another local day. Explicit timestamp deadlines retain their actual instants. Test both contracts when changing parser dates or event balancing.

## Remaining source coverage work

These are unresolved findings retained from the [November 21 validation](parser-validation-2026-11-21.md), not a fresh live scrape. Reproduce each against the current source and adapter before changing code.

- Wuthering Waves: improve current event-list and Tower of Adversity reset-layout extraction; distinguish unsupported layouts from genuine missing dates.
- Honkai: Star Rail: undated upcoming collaborations cannot be assigned invented ranges. Keep current endgame cycles distinct from overlapping historical version windows.
- Endfield, Genshin and ZZZ: inspect omitted rows to separate unpublished/TBA dates from unsupported layouts or invalid source dates.
- Summoning: FGO and ZZZ lacked dedicated validated banner sources in that validation. Do not claim complete summoning coverage from a green configured-source run alone.
- Unattended execution: desktop success does not prove that NAS/cloud browser navigation will succeed. Verify the actual image, headed mode, networking, pacing, time limit and failure alerts.

## Scheduling and deployment

Use the [deployment roadmap](deployment-roadmap-2026-11-24.md), especially phase 07, as the current scheduling checklist. Its initial target is Monday 06:00 America/New_York with a two-month horizon, persistent reports and one active scheduler. Scheduling, cloud hosting and provider accounts are planned work, not features enabled by this document. Generated files under `tmp` are ignored; do not remove live lock/report paths while a job is running.
