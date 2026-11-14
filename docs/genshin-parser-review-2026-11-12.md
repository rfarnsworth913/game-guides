# Genshin Impact parser review

For the configuration inventory, cross-parser findings, and prioritized implementation plan, see the [full parser report](parser-review-2026-11-12.md).

## Findings, in priority order

### 1. High: cleanup expires date-only events before the UI considers them ended

**Evidence:** `projects/data-parser/src/parsers/abstract-data-parser.ts:61`, `projects/guides-app/src/app/features/gacha/events/utils/event-calendar.ts:4`.

Cleanup parses `event.endDate` with `new Date()` and retains only future instants. A date-only value is interpreted at UTC midnight. The UI instead interprets a date-only end as the end of the user's local calendar day.

For `endDate = "2026-11-12"`, cleanup at `2026-11-12T12:00:00Z` removes the record even though the UI treats it as available until local November 13 midnight. This is reproducible with the current date operations. Daily tasks can be removed and recreated on every run during that interval; scraped events can disappear if replacement scraping fails.

**Improve:** introduce one explicit end-exclusive time contract shared by generation, cleanup, and display. For game resets, model the server region/reset time rather than choosing either parser-host midnight or browser midnight. Retain undated records for review instead of treating invalid dates as expired.

### 2. High: destructive cleanup happens before successful replacement, and removes ended history

**Evidence:** `abstract-data-parser.ts:38`, `abstract-data-parser.ts:98`, `projects/data-parser/src/services/data-service.ts:111`.

`parseData()` performs cleanup first. A subsequent source failure can leave previously stored records removed without fresh data. Expired parser records are physically deleted, so the dashboard's **Ended** filter cannot provide a durable history of those records after a parser run. Player completion state can outlive its removed catalog item.

**Improve:** fetch, validate, and stage source results before reconciling the catalog. Mark occurrences ended/archive them instead of deleting them immediately. Preserve the last successful source result when extraction fails. Distinguish a valid empty listing from a failed listing; an empty array alone cannot express both safely.

### 3. High: title-only insertion cannot represent corrections, overlapping occurrences, or reruns reliably

**Evidence:** `data-service.ts:160`, `data-service.ts:173`, `data-service.ts:132`, `projects/middleware/src/modules/documents/game-document.ts:97`.

`addRecords()` deduplicates by title, including within a batch, and never updates an existing matching title. A corrected deadline, URL, icon, or type remains stale. Two occurrences named `Epitome Invocation`, or two recurring periods with the same title, cannot coexist even when their periods differ. Broad title cleanup can remove an unexpired parser record too if an expired record has the same title.

The middleware is already more period-aware: its generated event ID includes game, optional raw ID, title, URL, type, and dates. That keeps normal period-based completion separate, but changing metadata that participates in the hash also changes the completion key.

**Improve:** separate a stable activity/source identity from a stable occurrence/cycle identity. Upsert mutable display fields on an occurrence and target cleanup by occurrence identity. Migrate old progress keys explicitly when changing IDs; do not re-key or discard existing completion data silently. Preserve manually authored records, which the existing writer already attempts to protect.

### 4. Medium: missing or differently formatted dates can silently discard real events

**Evidence:** `genshin-impact.ts:274`, `genshin-impact.ts:295`, `abstract-data-parser.ts:204`.

The event parser splits duration text on an en dash only. The classifier treats an empty raw end date as `Permanent` before considering event type, and Genshin then filters permanent events out. An em dash, a single-date event, an upcoming event with an unknown end date, or a changed duration layout can therefore disappear instead of appearing with an unknown date. Conversely, a nonempty invalid end date becomes an empty normalized date but can survive as temporary.

The selector also reads matching rows from **every** `table.wikitable`, assumes three fixed columns, and excludes any row containing a header cell. It does not verify the intended event table, table headings, or nonempty title before persistence.

**Improve:** scope extraction to named sections and map columns by header; normalize supported separators and date forms; represent unknown dates separately from permanent availability; quarantine incomplete records with a diagnostic. Determine classification using suitable title/type fields rather than assuming the third column contains the event's specific name.

### 5. Medium: banner extraction can reuse a previous period after an unrecognized header

**Evidence:** `genshin-impact.ts:332`.

`currentDuration` persists across rows. A new `th[colspan]` only replaces it if the English-month/em-dash regex matches. A later header using another format or `TBA` leaves the old period active, so following links can inherit the previous banner's dates. Fallback link selectors can also pick up non-banner links in the second column.

**Improve:** clear the period at every new duration block, validate parsed start/end dates before formatting, and restrict extracted links to actual banner entries. Add fixtures for multiple banner categories and malformed later headers. Do not silently turn an unknown period into a known but incorrect one.

### 6. Medium: recurring generation depends on the Version source and assumes six-week patches

**Evidence:** `genshin-impact.ts:26`, `genshin-impact.ts:146`.

All seven generated records are reached through the `Version` switch case, even the five calendar-based tasks. Removing that source prevents all generated tasks. A navigation error that propagates aborts the remaining sources. If extraction returns no usable version on a fresh parser instance, the five calendar tasks can still be generated, but the two patch tasks have no release date; the code does not load the last stored version as a fallback. Tests that seed `versionInfo` verify retention within an instance, not recovery from the database on a new run.

Artifact tasks use release date plus six weeks as the inclusive end date, independent of the actual next patch or maintenance window. That estimate can be wrong for nonstandard patch lengths; even a six-week cadence needs an explicit boundary convention.

**Improve:** generate calendar tasks independently, pass a captured clock into schedule functions, and generate patch tasks from verified boundaries. Label any estimate as estimated. Schedule parser execution around resets: this repository exposes `parser:start`, but no checked-in parser cron job was found. External scheduling may exist and was not inspected.

### 7. Medium: source/browser failures can leak resources or be reported as successful empty results

**Evidence:** `abstract-data-parser.ts:38`, `abstract-data-parser.ts:98`, `projects/data-parser/src/main.ts`.

Browser navigation and the fixed ten-second wait occur outside the callback's `try`. Failures there bypass `browser.close()`. Database disconnect is also only on the success path. Callback failures are logged and converted to an empty array, while the top-level per-game catch logs errors without setting a failure exit code. A scheduler can see an apparently successful process after individual games fail.

**Improve:** close browser/database resources in `finally`; give each source an explicit success/failure result; aggregate failures into the process result. Replace the fixed wait with bounded selector/readiness checks, HTTP status checks, and retry/backoff for transient failures. Reuse a browser where appropriate. `headless = false` is currently hardcoded in the shared parser and should be configurable for unattended execution.

### 8. Medium: database revisions change even when no records are added

**Evidence:** `data-service.ts:188`, `data-service.ts:204`, `data-service.ts:223`.

`addRecords()` executes the pipeline and increments `_revision` even with an empty `newRecords` array. Three source stages can advance revisions without changing event data, increasing editor conflict churn. Conversely, a version-only update does not increment `_revision`, and same-title version corrections are skipped altogether.

**Improve:** only advance the revision for an actual document change, and apply the same rule to version metadata. Preserve the atomic concurrent deduplication already present in the insertion pipeline. Test actual MongoDB updates, not only the shape of mocked `updateOne()` calls.

### 9. Medium: generated icon paths have no matching shipped SVG assets

**Evidence:** `genshin-impact.ts:62`, `genshin-impact.ts:370`, `angular.json`, `projects/guides-app/src/app/features/gacha/events/pages/events/events.ts:58`.

The parser creates paths such as `icons/genshin-impact/commission.svg`, `temporary.svg`, and `banner-0.svg`. No matching SVGs were found in the repository. Angular's configured static asset input is `projects/guides-app/public`, which is absent in this checkout. Uploaded game images under `src/assets` use a separate middleware image route; they do not automatically satisfy these icon paths.

The UI accepts these paths and falls back when loading fails, so rows remain usable, but the parser is not supplying the event artwork pictured in the dashboard design. Deployment-provided static assets were not inspected.

**Improve:** ship a verified generic icon map, or capture/store approved artwork URLs with attribution. Use a generic banner icon until real artwork exists; ordinal filenames are not stable banner identities. Add a build/route-level asset check.

## Captured fields versus UI use

Flow: configured source -> parser -> shared MongoDB root `events`/`version` -> middleware catalog adapter -> `WorkspaceStore` -> game events/dashboard.

| Captured field | Storage/API transformation | Current UI use | Assessment |
| --- | --- | --- | --- |
| Event `title` | Becomes catalog `name`; also participates in generated ID | Row title, search, accessible labels | Used; should not also be the only database identity |
| Event `url` | Becomes `wikiUrl`; participates in generated ID | Game event list/calendar opens validated HTTP(S) links; dashboard rows navigate to the game's Events page | Used, with different navigation behavior by view |
| Event `startDate` | Preserved as string; Dates serialize to ISO | Status, calendar placement, date range, upcoming countdown, ID | Used; region/time precision is missing |
| Event `endDate` | Same conversion | Deadline ordering, countdown, urgency, calendar, cleanup, ID | Used, with conflicting cleanup/UI semantics |
| Event `eventType` | Both `category` and `eventType`; participates in ID | Type badges, dropdown filters | Used; one value per record, not multiple tags |
| Event `icon` | Preserved | Thumbnail/icon with fallback on invalid/missing image | Consumed, but generated files are not shipped here |
| Event `completed: false` | Stripped from parser writes and migration; not trusted by catalog adapter | Actual completion comes from account/guest progress | Correct separation; parser flag is redundant |
| Version `title` | Root `version`; `updateVersion()` compares title | No normal dashboard/game-catalog binding found | Stored, not surfaced in normal UI |
| Version `releaseDate` | Root `version`; in-memory value drives artifact task periods | Indirectly through generated tasks | Used by parser, not a displayed patch release record |
| Version `url` | Root `version` | No normal UI binding found | Available through raw parsed-data API, not the standard catalog |
| `isNewVersion` | In-memory parser flag | No consumer in Genshin's remaining source flow | Currently unused for behavior |

`GamesRepository.read()` returns `GameSnapshot`, which has no version field. `/api/games/genshin/parsed` exposes raw parser data, but no Angular consumer for that endpoint was found. Story-guide patch metadata is independently authored; parsing a version does not populate or update story templates.

## Coverage and gaps

There are **three configured scraped sources**: Version, Banners, and Events. With a valid release date, generation produces **seven records**, in addition to scraped rows. That is output generation, not a guarantee of seven new inserts because the writer deduplicates by title.

| Area/task | Captured today | Gap / recommended treatment |
| --- | --- | --- |
| Current version | First released table row: combined version/name, release date, URL | Assumes newest-first source ordering; no explicit sort by release date, upcoming patch, next maintenance boundary, or source freshness |
| Version changes | Title comparison and root overwrite | No historical version collection or same-title corrections; no normal UI presentation |
| Character event wishes | Matching links under Current Event Wishes and its following table; title, link, period, Banner type | Conditional on source structure; no Character Event Wish vs Wish-2 subtype, featured characters, rarity/rate-up metadata, or collection associations |
| Weapon event wishes | Can be captured if links are in the same supported table layout | Same generic Banner type; repeated `Epitome Invocation` titles are especially vulnerable to title-only deduplication |
| Chronicled Wish | No dedicated source/section handling | Capture only if it happens to appear inside the supported current-wishes table. Add explicit coverage/fixtures rather than claiming it is fully supported |
| Permanent/beginner wishes | No dedicated generation | Reasonable to omit from deadline-driven events; provide reference data separately if desired |
| Upcoming wish phases | No dedicated upcoming section | Only included if the current table happens to contain them; no reliable advance schedule |
| Wish history, pity, pulls, guarantees | Not captured | Account-specific planner/history feature, not public event scraping; keep separate from shared data |
| Daily Commissions | One daily binary checklist record | Does not represent four reward claims, Encounter Point alternatives, or bonus reward collection separately |
| Original Resin, expeditions, daily check-in, paid daily claims | No dedicated tasks | Optional user-enabled routine definitions; amounts, current resources, and subscription ownership belong in player state |
| Trounce Domains | One Monday-Sunday checklist record | No individual boss/reward claim counts, resource costs, or personal weekly limits |
| Other weekly routines | No dedicated generation | Consider reputation tasks where applicable, weekly objectives, and other optional routines after defining desired scope; verify region/unlock-specific rules |
| Paimon's Bargains | One calendar-month checklist record | No separate shop purchases, quantities, eligibility, or monthly inventory detail |
| Spiral Abyss | Active cycle: 16th through 15th, Endgame type | Correct calendar anchor; no server reset instant, floor/star/reward detail, next-cycle preview, or dedicated result tracking |
| Imaginarium Theater | Active calendar month, Endgame type | Correct calendar anchor; no season restrictions, difficulty/act/reward detail, or result tracking |
| Stygian Onslaught | Classifier recognizes its name if present in the supplied type string | No dedicated schedule generator or explicit extraction; not guaranteed when the third column is generic. No separate challenge/reward-window detail |
| Artifact Extraction / Definition | Two Crafting checkboxes, release date through six weeks later | Estimated patch window; no unlock, charge/use count, crafting target, or resource tracking |
| Limited-time in-game events | Generic table extraction, title/URL/dates/type | No explicit ongoing/upcoming section contract; no stages, requirements, rewards, event story links, or separate claim deadline |
| Battle Pass / Miliastra Pass | Type detection if the third column contains the expected strings | No pass-level progress, daily/weekly missions, purchase cutoff, or separate pass identity |
| TCG events | Forge Realm / Heated Battle strings in supplied type column | Conditional coverage; no dedicated source, rotation generator, or match/score progress |
| Web events | Web string in type column | Only those listed on this source page; no coverage guarantee for every official web activity |
| Permanent / undated activities | Permanent classified rows excluded | Permanent omission may be intentional; unknown-dated upcoming events should not be discarded with them |
| Ended event history | Physically removed at parser cleanup | Conflicts with a persistent Ended browsing experience; archive instead |

The monthly reset anchors match [HoYoverse's Spiral Abyss/Theater help article](https://support.hoyoverse.com/hc/en-us/articles/50333950598553-When-does-the-Spiral-Abyss-reset-and-what-are-the-rewards), which directs players to the in-game timer for exact timing. [HoYoverse's Encounter Points explanation](https://support.hoyoverse.com/hc/en-us/articles/50333944750105-How-do-Encounter-Points-work) confirms the alternative commission-reward path; a single commission checkbox does not model that detail. These are modeling gaps, not reasons to scrape private account progress.

[The official Chronicled Wish FAQ](https://genshin.hoyoverse.com/en/news/detail/122695) establishes it as a distinct, periodically available wish category. [Official Version 7.2 update notes](https://genshin.hoyoverse.com/m/en/news/detail/167187) reference Stygian Onslaught, supporting its inclusion in a coverage checklist; neither source proves that the configured Fandom tables expose these categories in the parser's expected layout. [An official event notice](https://genshin.hoyoverse.com/en/news/detail/6539) documents daily/weekly BP resets at 04:00 server time, illustrating why host-local midnight is not a universal game reset rule. Verify current per-activity schedules before implementing them.

## Activity gaps and priorities

The coverage matrix above distinguishes missing activities from activities that already have a basic checklist entry. A missing detail does not necessarily require another scraper: recurring routines can use shared schedule definitions, while personal amounts and completion belong in player state. This remains a code-based assessment, not an exhaustive verified inventory of live activities.

| Area | Missing or partial coverage | Recommended next step |
| --- | --- | --- |
| Endgame | Spiral Abyss and Imaginarium Theater have calendar cycles but no precise server reset instants or seasonal details. Stygian Onslaught has conditional classification rather than guaranteed extraction. TCG rotations also depend on the generic event listing. | Prioritize explicit Stygian Onslaught coverage and verified server-aware schedules. Add season restrictions, floors/acts, difficulties, and rewards only where the UI will use them. |
| Summoning | Current wishes have basic names and periods. Upcoming phases and Chronicled Wish have no dedicated coverage; character and weapon wishes share one generic type. Featured characters/weapons are not captured. | Add explicit banner categories and current/upcoming/Chronicled Wish fixtures, then connect featured items to shared character/weapon definitions. Keep permanent and beginner wishes in reference data rather than deadline reminders. |
| In-game events | Event stages, participation requirements, rewards, related story content, and separate reward-claim deadlines are missing. Unknown end dates can cause genuine events to be omitted. | Fix date/availability handling first. Support distinct participation and reward-claim windows, then optional stage-level definitions. |
| Web events | Only web activities present in the configured listing can be captured. | Evaluate a dedicated official listing or curated supplemental source; do not assume the generic listing is complete. |
| Dailies | Only Daily Commissions has a generated daily entry. Resin spending, expeditions, HoYoLAB check-in, and optional paid daily claims have no dedicated definitions. Commission reward claims and Encounter Point alternatives are not represented separately. | Introduce configurable, opt-in routine definitions. Distinguish game-server resets from any external check-in schedule, and avoid double-counting commissions and Encounter Points as separate required tasks. |
| Weeklies | Trounce Domains have one checkbox. Individual reward claims, Battle Pass objectives, and applicable reputation routines are not represented. | Define optional weekly tasks and personal counters, with unlock/region applicability verified before adding defaults. |
| Monthly and patch routines | Paimon's Bargains and artifact crafting have coarse checkboxes. Shop purchase quantities, crafting uses, resources, and precise patch boundaries are missing. | Verify occurrence boundaries first, then add shared item/limit definitions with user-owned purchase/use counts. |
| Battle Pass and related passes | Detection exists, but separate pass identities, level progress, objectives, purchase cutoffs, and claim deadlines are absent. | Treat pass schedules/objectives as shared definitions and ownership/progress as personal state. Verify the relevant pass's rules rather than applying one generic schedule. |

### Shared definitions versus personal progress

The public parser should supply activity identity, category, occurrence dates, reset rules, requirements, featured items, stages, and reward definitions where reliable sources exist. These values are shared by all users, with server-specific schedules where applicable.

Store resin balances, expedition assignments, rewards claimed, Abyss stars, Theater acts completed, challenge results, shop purchases, crafting uses, pass ownership/level, wish history, pity, and selected targets in user-specific state. Those are potential tracking features, not data the public scraper can infer about an account. Some require richer UI and progress models before adding parser fields would provide value.

### Recommended coverage backlog

After fixing retention, occurrence identity, and date semantics from the code review:

1. Guarantee Stygian Onslaught coverage and accurate reset/availability windows for endgame activities.
2. Cover upcoming banners and Chronicled Wish explicitly, with character/weapon distinctions.
3. Preserve upcoming events with unknown dates and distinguish participation from reward-claim deadlines.
4. Add configurable daily and weekly routines, including independent external check-in schedules where wanted.
5. Add detailed endgame, pass, shop, and crafting progress once the UI supports the corresponding personal counters.
6. Expand artwork, rewards, and featured-item associations to improve presentation and planning.

These are proposed feature priorities. They do not replace source validation or justify inventing schedules for activities whose current rules have not been verified.

## Test coverage to add

Existing tests cover source dispatch, seven generated tasks, invalid version dates, released-version selection, monthly/year/leap boundaries, HTML extraction, missing tables, link fallback layouts, type mapping through supplied examples, and database failure paths. Valuable coverage remains, but some tests currently encode limitations such as empty-date output and title-only insertion.

Add regression tests for:

1. Date-only end boundaries across UTC and multiple server regions; daily/weekly/monthly reset instants; timestamps with offsets.
2. A failed scrape after existing data is loaded: no destructive loss, correct failure result, browser/database closure on navigation errors.
3. Two simultaneous same-title occurrences, a corrected same-occurrence deadline, and targeted cleanup that preserves the other occurrence and manual records.
4. No-op runs leaving `_revision` unchanged, including actual MongoDB integration behavior.
5. Alternate duration separators, unknown end dates, malformed rows, unrelated wiki tables, and empty titles/URLs.
6. A valid banner duration followed by an invalid header, dedicated Chronicled Wish layouts, repeated weapon-wish names, and upcoming phases.
7. Fresh-run version failure with a stored version, omitted/reordered sources, nonstandard patch lengths, and same-title version metadata corrections.
8. Parser -> middleware -> UI asset resolution and progress preservation when shared metadata changes.

## Suggested implementation order

1. Back up the affected catalog and player progress; define occurrence identity and date semantics before migrations.
2. Make reconciliation non-destructive and source-aware; fix date cutoff handling and failure reporting/resource cleanup.
3. Replace title-only insertion with occurrence upserts and archive ended records. Preserve old completion mappings during migration.
4. Introduce server-aware schedule definitions and a controllable clock; decouple recurring generation from version scraping.
5. Harden extraction with representative source fixtures and a separate live-source contract check. Do not make ordinary unit tests depend on external websites.
6. Fix asset delivery and add freshness metadata. Expose version metadata through the normal catalog only if the UI will use it.
7. Expand banner categories and optional task definitions based on product priorities. Use personal counters for detailed progress instead of adding public completion fields.

Small cleanup after correctness work: remove the unused `knownTitles` set, remove redundant generated `completed` flags, relocate stale crafting comments from `getMonthlyEvents()`, avoid recomputing classification twice per event, and prefer an injected clock/pure schedule helpers over repeated `new Date()` calls. These are lower priority than retention and identity.
