# Todoist project: Game Guides - Scheduled Data Parsers

## Monday runner implementation

The shared runner covers all eight configured games and excludes Final Fantasy XIV. Run it once each Monday; predictable daily, weekly and monthly activities are generated through two calendar months. Dynamic events use published dates only. Unknown future patches and irregular endgame cycles are not extrapolated.

```powershell
npx playwright install chromium
npx puppeteer browsers install chrome
npm run parser:preview
npm run parser:preview -- --headed
npm run parser:preview -- --game=genshin,hsr --at=2026-11-21T18:00:00Z
npm run parser:weekly
```

Preview does not instantiate MongoDB or download images. Inspect `tmp/parser-sync/report.json`: it includes version metadata, every generated event, per-source errors and an overall success flag. `parser:weekly` writes using `DB_CONN_STRING`, `DB_NAME` and `DB_COLLECTION` from the environment or the repository `.env`. Use the existing database backup process before the first write.

Browser scraping pauses a random 10–30 seconds between uncached page visits and waits another 10 seconds after navigation before inspecting or parsing the page. The first visit has only the post-navigation wait; cache hits do not navigate or wait. These waits apply to failures too. A later successful page navigation during the wait can replace an initial 403 response. Requests to JSON feeds retain their separate bounded retry behavior.

HTTP failures now include the final page title and a short visible-text excerpt. HTML and screenshots are saved under `browser-errors` beside the JSON report, making a Cloudflare verification page distinguishable from a missing article. The additional waits increase the scheduled job's runtime; keep overlap protection enabled.

Headed mode (`--headed`, which sets `headless: false`) improves access to Endfield and IOP Wiki in the local checks. The headed preview retrieved Endfield's version and nine dated events, plus GF2's version, four events and four banners. Missing date ranges still produce an incomplete report. Set the process environment variable `PARSER_HEADLESS=false` to retain headed mode across scheduled runs; use `--headless` to override it explicitly. The CLI default remains headless unless the environment or a flag changes it. This setting is read from the process environment, not the database `.env` loader.

The parser CLI defaults to the Chrome build provisioned by Puppeteer, with Playwright controlling navigation and extraction. In the comparison, headed Puppeteer reached the Genshin version article with HTTP 200 after a 10-second wait. Playwright also reached it with HTTP 200 using the same Chrome 153 executable, while Playwright's bundled Chromium remained on Cloudflare's verification page. Use `--browser=chromium` to select Playwright's bundled browser, or set `PARSER_BROWSER_EXECUTABLE` to an explicit executable path. Browser fixtures and application E2E tests continue to use Playwright's bundled Chromium. The parser Docker image installs both browser builds.

The subsequent headed Chrome dry run loaded all three Genshin sources: version 7.2, seven banners and 17 events. It still returned an incomplete status because 16 event rows lacked valid date ranges; Cloudflare was no longer the failure in that run. The other Fandom configurations still need the same live verification with the selected Chrome build.

The parser Docker image defaults to `PARSER_HEADLESS=false` and launches commands through Xvfb, a virtual display for Linux. This permits headed Chromium on the NAS without a physical monitor, remote desktop or published display port. Its Docker build and headed behavior still need verification on the NAS itself.

The runner preserves stored events and user progress, deduplicates by title and dates, continues other games after a source fails, and returns a nonzero exit status for incomplete extraction. Successful sources and predictable recurrences can still be imported on a partially failed run. It does not clear expired records. A lock prevents overlapping runs. After a crash, inspect the PID in `projects/data-parser/.weekly-sync.lock` before removing that file; container runs place it in `/reports/weekly-sync.lock` instead.

### Live source verification

On November 21, 2026, read-only previews confirmed FGO's US App Store version, GF2's official Darkwinter Steam update feed, and NTE's released version and 16 dated events. Headless wiki requests returned HTTP 403; rerunning headed retrieved Endfield's version and nine dated events, plus GF2 event data. Fandom's 403 responses contained Cloudflare verification pages. The browser-build comparison above recovered access to the Genshin version article. Endfield also lists events with only a release date; their end dates remain unknown and are reported rather than invented. NTE's complete configured source preview passed after excluding maintenance notices and parsing the contest submission window. **Complete live dynamic-event coverage is not yet verified. Keep the scheduled job disabled until its preview succeeds on the NAS and the dates have been reviewed.**

Default recurrence profiles are English/Americas, with FGO US and GF2 EN. Review the fixed server offsets and reset hours in `projects/data-parser/src/sync/game-profiles.ts` for your account region. Stored dates are inclusive server-calendar days, matching the existing UI; they do not represent exact reset timestamps in every viewer's timezone. A current cycle may start before today, and its end can extend beyond the two-month horizon. Changing server region after importing creates different occurrences and needs a separate data review.

Version sources are maintained in each game's configuration. NTE uses its official patch notices; GF2's fallback version is the publisher's update title rather than a fabricated numeric version. Published event sources include banners and dated endgame tables where available. Future TBA dates, permanent content without an end date, and unannounced cycles are omitted and reported rather than assigned invented deadlines. Existing legacy parser classes remain available; the weekly CLI uses the new shared Playwright pipeline.

### Synology setup

1. Build from the repository root on the NAS, or transfer a locally built image compatible with its CPU:

   ```sh
   docker build -f projects/data-parser/Dockerfile -t game-guides-parser:local .
   ```

2. Create `/volume1/docker/game-guides/parser-reports` and a restricted environment file, for example `/volume1/docker/game-guides/parser.env`, containing only `DB_CONN_STRING`, `DB_NAME` and `DB_COLLECTION`. The MongoDB URL must use the NAS/container-accessible hostname and published port, or the database service name on a shared Docker network. Container `localhost` refers to the parser itself. Grant the report directory write access to the container's `node` user (UID 1000); keep credentials readable only by the task owner.

3. Test without database writes:

   ```sh
   docker run --rm --name game-guides-parser-preview \
     --mount type=bind,src=/volume1/docker/game-guides/parser-reports,dst=/reports \
     game-guides-parser:local npm run parser:preview -- --report=/reports/preview.json
   ```

4. After reviewing a successful preview, test the write command below manually. In DSM **Control Panel → Task Scheduler → Create → Scheduled Task → User-defined script**, use the account allowed to run Container Manager, choose **weekly, Monday, 06:00**, and enable failure notifications. Use the NAS timezone deliberately. No inbound port or internet hosting configuration is needed.

   ```sh
   docker run --rm --name game-guides-parser-weekly \
     --env-file /volume1/docker/game-guides/parser.env \
     --mount type=bind,src=/volume1/docker/game-guides/parser-reports,dst=/reports \
     game-guides-parser:local
   ```

5. Inspect `/volume1/docker/game-guides/parser-reports/latest.json` and DSM's execution log after each run. Keep the Docker command's exit code intact. Rebuild the image after parser/configuration updates. The Dockerfile is supplied for NAS installation; it has not been built in this Windows workspace.

The equivalent cron expression is `0 6 * * 1`. Configure either DSM or cron, never both. No job has been installed on the NAS by these repository changes.

Browser installation in CI uses `npx playwright install --with-deps chromium`, following the [Playwright CI instructions](https://playwright.dev/docs/ci). `npm run parser:browser-test` checks local HTML fixtures with the real browser; `npm run ui:e2e` uses Playwright for the isolated application tests. Live source scraping stays outside required CI so source outages cannot masquerade as test regressions. Puppeteer remains a dependency for the legacy parser implementations.

## Original rollout checklist

The checklist below records the earlier rollout plan; the runner implementation above supersedes its descriptions of missing CLI support. Source access and NAS verification gates still apply.

Scope: schedule one-shot parser jobs on the Synology NAS using DSM Task Scheduler (or one deliberately chosen cron installation). This extends the LAN-only, single-production-environment deployment plan. It creates tasks only: no cron jobs, scheduler settings or parser code are changed.

Import [parser-scheduling-todoist.csv](parser-scheduling-todoist.csv) into a new Todoist project using **Import & export -> Import from CSV**. Tasks are grouped in implementation order. Gate tasks use priority 2, other tasks priority 4; no dates or assignees are invented. Gates are manual checks rather than automatic Todoist dependencies.

The runner currently processes supported configurations sequentially; per-game CLI selection, safe aggregate exit status, configurable headless execution and lifecycle/persistence safeguards need implementation or verification before unattended use. Unsupported configurations must not become scheduled jobs by default.

A recurring Todoist reminder is not a NAS cron job. Set the actual NAS schedule only after selecting refresh frequency and verifying source policy, game-server reset semantics, runtime and recovery. Keep schedules disabled until the relevant gates pass. Disposable CI/local test databases are testing tools; no permanent staging environment is assumed.

References:

- [NAS deployment runbook](nas-ci-deployment-guide-2026-11-14.md)
- [Parser coverage and reliability review](parser-review-2026-11-12.md)
- [Synology Task Scheduler](https://kb.synology.com/en-uk/DSM/help/DSM/AdminCenter/system_taskscheduler)
- [Synology scheduled-script tips](https://kb.synology.com/en-af/DSM/tutorial/common_mistake_in_task_scheduler_script)
- [Cron syntax and time behavior](https://man7.org/linux/man-pages/man5/crontab.5.html) - verify your NAS implementation before using implementation-specific features.
- [Todoist CSV import format](https://www.todoist.com/help/account-and-billing/security/import-or-export-a-project-as-a-csv-file-in-todoist-YC8YvN)

## 01 - Confirm parser scope and scheduling requirements

- [ ] Inventory supported and disabled parser configurations
  - Current runner dispatches Endfield, Genshin Impact, Honkai: Star Rail and Zenless Zone Zero sequentially. Wuthering Waves is commented out; FGO/GF2/NTE configurations do not represent working integrations.
- [ ] Choose the initial games to schedule
  - Enable only implemented, validated games. Treat Wuthering Waves activation and missing integrations as separate reviewed work; do not create jobs merely because a configuration file exists.
- [ ] Choose one scheduler for the NAS
  - Prefer DSM Task Scheduler user-defined scripts. Use cron only if deliberately supported and maintained; do not duplicate the same jobs in DSM and crontab.
- [ ] Define source-refresh frequency and freshness targets
  - Choose a conservative polling cadence based on source terms, runtime and acceptable staleness. Source scraping frequency is separate from daily/weekly/monthly activity reset rules.
- [ ] Record NAS timezone and game-server reset profiles
  - Document each supported server timezone, reset instant and DST behavior. Do not treat NAS local midnight as the reset for every game.
- [ ] Choose one all-games job or implement explicit game selection
  - The current npm run parser:start executes the sequential runner and has no per-game CLI filter. Start with one locked job, or add and test game/source selectors before defining separate schedules.
- [ ] Gate: approve the enabled games and scheduling policy
  - Record scheduler owner, allowed sources, cadence, timezone assumptions and expected completion/freshness thresholds. Do not invent production schedules until these are selected.

## 02 - Make the runner safe for unattended execution

- [ ] Validate configurations before opening database or browser clients
  - Validate JSON shape, enabled IDs and source types. Distinguish disabled/planned placeholders from invalid enabled configurations; handle malformed files without misleading success.
- [ ] Return a failing process exit code for failed enabled parsers
  - The current per-game catch logs errors and continues. Aggregate failures into a nonzero final outcome while retaining per-game/source diagnostics.
- [ ] Distinguish successful empty results from extraction failures
  - Do not swallow source exceptions as empty arrays. Record structured source outcomes and preserve last successful data when extraction fails.
- [ ] Await database initialization and guarantee disconnection
  - Replace constructor-started connection side effects with awaited lifecycle ownership. Close MongoDB in finally paths on success, errors and cancellation.
- [ ] Make headless mode configurable for NAS execution
  - The shared parser currently hardcodes headless=false. Verify Chromium can run without an interactive desktop and retain the browser sandbox where supported.
- [ ] Guarantee browser cleanup and bounded source processing
  - Close pages and browsers in finally paths; configure navigation/readiness timeouts and bounded retries with backoff. Replace unconditional fixed waits with tested readiness checks.
- [ ] Handle SIGTERM and interrupted runs
  - Stop accepting new work, close browser/DB resources and exit within a bounded grace period. Forced termination must not leave a partially destructive refresh.
- [ ] Add run and source outcome summaries
  - Include run ID, game/source, start/end, duration, counts and error category. Report actual success, partial failure, timeout and intentional skip distinctly.
- [ ] Gate: demonstrate bounded execution and accurate failure status
  - Verify success exits zero, enabled-source failures exit nonzero, cleanup occurs and the process terminates without hanging.

## 03 - Protect existing data and completion tracking

- [ ] Move destructive cleanup after validated source acquisition
  - Do not delete catalog records before fetching their replacements. Preserve last successful records on timeout, invalid markup or empty-failure results.
- [ ] Preserve ended event history and manually added content
  - Use an explicit retention/archive policy. Never broadly remove same-title records or user/editor-managed entries.
- [ ] Use stable activity and occurrence identities for upserts
  - Allow date/URL corrections without changing personal completion identity. Preserve progress mappings through additive migration or aliases.
- [ ] Align expiry and recurrence semantics with the UI
  - Test the full end day, end-exclusive instants, timezone boundaries and recurring periods. Verify Genshin 1st/16th monthly cycles without duplicating or losing occurrences.
- [ ] Avoid no-op revision changes and unsafe concurrent writes
  - Advance shared revisions only on real changes. Make deduplication/upserts atomic and ensure API/editor changes cannot be overwritten by stale parser snapshots.
- [ ] Verify parser writes cannot reset personal user state
  - Parser output updates shared definitions only. Preserve account completion, collection data and editor content.
- [ ] Test repeated runs and source corrections for idempotency
  - Run the same fixtures twice; confirm no duplicate records, unnecessary revision churn or changed completion keys. Test corrected dates and overlapping same-name cycles.
- [ ] Gate: prove failure and reruns preserve production-equivalent data
  - Use disposable data to verify history, manual records and user progress survive failed fetches, retries, cancellations and successful reruns.

## 04 - Package the parser runtime and NAS configuration

- [ ] Build a versioned Linux AMD64 parser image
  - Reuse the deployment plan's immutable tested releases. Include the required runtime/shared modules; do not depend on omitted development-only tsx packages.
- [ ] Install and verify Chromium runtime dependencies
  - Test browser launch on DSM under the intended non-root user, sandbox settings and resource limits. Do not assume Ubuntu CI dependencies transfer unchanged.
- [ ] Define explicit working and configuration paths
  - The current runner resolves projects/data-parser/config from process.cwd(). Package that layout or add a configurable absolute config path; test the scheduled working directory.
- [ ] Create a least-privilege parser MongoDB user
  - Grant only the required application-data access. Keep administrator and private account-progress credentials out of parser configuration.
- [ ] Store parser secrets in protected NAS configuration
  - Provide DB_CONN_STRING, DB_NAME and DB_COLLECTION through the reviewed runtime contract. Do not place passwords or URIs in scheduler commands, Git, logs or Todoist.
- [ ] Configure private database networking and outbound source access
  - Use the MongoDB container alias and internal port when co-located. Allow source/DNS/TLS egress without publishing parser or database ports.
- [ ] Set writable temporary paths and resource limits
  - Provide per-run browser profiles and required cache/temp mounts only. Bound CPU, memory, PID usage and log storage; avoid broad NAS mounts.
- [ ] Gate: run the exact parser image successfully in a disposable environment
  - Verify config resolution, browser launch, database permissions, clean exit and state preservation using the intended container command.

## 05 - Create a guarded job wrapper

- [ ] Create one reviewed parser-job entry point on the NAS
  - Use absolute executable, Compose/project and log paths. Scheduler execution must not rely on an interactive shell profile, npm PATH or a development PC.
- [ ] Launch a one-shot container and propagate its exit status
  - Use the reviewed Compose one-shot equivalent after verifying DSM tooling. Do not require an always-running parser container or hide failure behind a logging pipeline.
- [ ] Prevent overlapping scheduled and manual runs
  - Use an exclusive lock in a verified persistent location. Hold it for the entire child-process lifetime and record intentional overlap skips distinctly.
- [ ] Coordinate parser jobs with deployment and backup maintenance
  - Use the same maintenance/locking contract as the NAS deploy task. Stop and drain running writers before backup/migration; blocked launches must not bypass maintenance.
- [ ] Add a maximum runtime and graceful stop policy
  - Stop the entire job container/process tree after the approved deadline, then verify browser and DB cleanup. Test lock release; do not leave orphan writers.
- [ ] Add bounded transient-error retries
  - Retry only known temporary network/rate-limit failures with backoff and a cap. Do not blindly rerun destructive or invalid-configuration failures.
- [ ] Capture redacted logs and final job status
  - Keep start/end, duration, image digest, per-source outcomes and final code. Rotate logs and preserve the original failure when notification/logging also fails.
- [ ] Add a safe manual run and disable procedure
  - Manual execution uses the same lock and credentials as scheduled runs. Document how to disable future runs and stop an active job safely.
- [ ] Gate: test overlap, timeout and maintenance behavior
  - Two launches must not produce concurrent writers; timeout must stop the whole job; maintenance must block both scheduled and manual starts.

## 06 - Configure DSM schedules without enabling production writes

- [ ] Verify the DSM version and Task Scheduler capabilities
  - Use Control Panel > Task Scheduler > Create > Scheduled Task > User-defined script. Confirm actual installed UI/tooling and keep the first task disabled.
- [ ] Choose the scheduler execution identity and permissions
  - Use the least privilege supported by the container launcher. Docker access is effectively administrative; protect wrapper and environment files against untrusted modification.
- [ ] Register the reviewed wrapper with explicit paths
  - Do not embed secrets, npm installs, builds or downloaded shell payloads in the task. The wrapper launches the approved parser image.
- [ ] Configure the selected refresh times and timezone
  - Use the approved cadence; stagger separate jobs only after per-game selection exists. Check DST and reboot behavior instead of assuming every missed run is replayed.
- [ ] Configure failure notifications and log retention
  - Send useful non-secret failure details. Treat intentional maintenance/overlap skips separately from errors and alert if skips cause stale data.
- [ ] Export or document the scheduler configuration
  - Record task names, script paths, account, timezone, schedule, enabled status, timeout and owner outside the NAS for recovery.
- [ ] Gate: confirm there is one disabled scheduler configuration
  - No duplicate cron/DSM jobs, unsupported game jobs, public endpoints or staging environment are required. Do not enable unattended production writes yet.

## 07 - Verify scheduled behavior against disposable data

- [ ] Run lint, parser tests and applicable regression suites
  - Verify the candidate commit before publishing. Add coverage for lifecycle, failure status, config validation, date boundaries and persistence changes.
- [ ] Test the scheduled command in a minimal environment
  - Use the same working directory, user permissions, paths and environment contract as DSM; confirm no interactive login is needed.
- [ ] Exercise source, browser and database failure scenarios
  - Test unreachable sources, changed markup, invalid config, expired/invalid TLS, denied DB access and browser launch failure. Verify bounded failure with useful logs.
- [ ] Test persistence and failure recovery using disposable MongoDB
  - Use fixtures plus manual records and multiple users' progress. Confirm reruns, expiry and interrupted writes preserve intended state; never point destructive tests at production.
- [ ] Verify notifications and stale-source detection
  - Simulate partial failure, timeout and skipped runs. A job that starts regularly but fails to refresh a required source must still alert.
- [ ] Test reboot, missed-run and deployment coordination behavior
  - Verify lock recovery, task persistence, maintenance exclusions and the documented manual catch-up policy without overlapping writers.
- [ ] Measure resource use and worst-case runtime
  - Check memory/CPU/temp disk and source request volume. Adjust limits, cadence and timeouts based on measured results.
- [ ] Gate: approve the tested image and job wrapper for first live execution
  - Require passing failure-path tests, trustworthy exit codes, no data-loss regressions and recoverable configuration.

## 08 - Enable controlled production runs and monitoring

- [ ] Back up the production database and record the parser release
  - Use the NAS backup/maintenance procedure; include assets if the parser gains asset writes. Preserve the previous image digest and a tested restore path.
- [ ] Run the first controlled parser refresh through the wrapper
  - Keep unattended scheduling disabled. Use a maintenance window where appropriate and inspect the actual source outcomes and changed records.
- [ ] Check the dashboard and game events after refreshing the UI
  - Verify counts, dates, urgency order, filters, artwork fallback and completion state. Existing open pages do not automatically subscribe to parser database changes.
- [ ] Enable only the approved production schedule
  - Start conservatively with the validated games and cadence. If separate game jobs are needed, enable selectors first and stagger without overlapping writes.
- [ ] Monitor the first scheduled cycles and source freshness
  - Verify duration, failures, retries, revisions, storage growth and last successful refresh per required source; tune cadence from observed behavior.
- [ ] Verify parser jobs pause and resume safely around releases
  - Coordinate image updates and database schema compatibility with the deployment maintenance lock; do not replace an image underneath a running job.
- [ ] Document the incident and rollback procedure
  - Disable the schedule, stop active writers safely and preserve logs. Revert parser images only if schema-compatible; deliberate data restoration must account for writes since backup.
- [ ] Assign ongoing ownership for schedules and source changes
  - Review freshness alerts, source policy, selectors, dependency/browser patches, credentials and recovery periodically. Choose recurring dates after agreeing operational cadence.
- [ ] Gate: confirm unattended parser operation is reliable
  - One scheduler launches tested bounded jobs, production state and progress are preserved, stale/failed sources alert and disable/recovery steps work.
