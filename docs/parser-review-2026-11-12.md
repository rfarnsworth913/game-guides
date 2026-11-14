# Parser coverage, UI usage, and next steps

## Executive assessment

Eight configuration files do **not** mean eight working integrations:

- Four games have a dispatched implementation: Arknights: Endfield, Genshin Impact, Honkai: Star Rail, and Zenless Zone Zero.
- Wuthering Waves has an exported implementation and tests, but its runner case is commented out.
- Fate/Grand Order has a source configuration but no implementation, dispatch case, or UI game registration.
- Girls' Frontline 2 and Neverness to Everness have empty configuration objects and no implementations. NTE is registered in the UI; GF2 is not.
- Endfield and ZZZ have no dedicated parser test suites. The passing test suite therefore does not establish coverage of every dispatched parser.

The first priority is reliable occurrence identity, time semantics, and non-destructive persistence. Adding scrapers before fixing these foundations will multiply stale dates, lost history, inconsistent completion keys, and avoidable editor conflicts.

## 1. Configuration and execution inventory

| Configuration | ID / source entries | Class exists / exported | Runner dispatch | UI/API registration | Effective status |
| --- | --- | --- | --- | --- | --- |
| `arknights-endfield.json` | `Arknights: Endfield`; 1 | `ArknightsEndfield`; yes | Active | `endfield`; yes | Version extraction and four generated routines only |
| `fate-grand-order.json` | `Fate Grand Order`; 1 | No | None | No | Source declared, no ingestion or UI path |
| `genshin-impact.json` | `Genshin Impact`; 3 | `GenshinImpactParser`; yes | Active | `genshin`; yes | Basic version, banner, event and routine ingestion |
| `girls-frontline-2.json` | `{}`; no ID or sources | No | None | No | Unconfigured placeholder |
| `honkai-star-rail.json` | `Honkai Star Rail`; 7 | `HonkaiStarRailParser`; yes | Active | `hsr`; explicit display-name mapping | Version, events, four endgame sources, routines; Version duplicated |
| `neverness-to-everness.json` | `{}`; no ID or sources | No | None | `nte`; yes | UI exists without parser coverage |
| `wuthering-waves.json` | `Wuthering Waves`; 5 | `WutheringWavesParser`; yes | **Commented out** | `wuwa`; yes | Implementation is unreachable from normal parser execution |
| `zenless-zone-zero.json` | `Zenless Zone Zero`; 2 | `ZenlessZoneZeroParser`; yes | Active | `zzz`; yes | Version, generic events, four routines |

Evidence: `projects/data-parser/src/main.ts`, `src/parsers/index.ts`, configuration files, `projects/lib/constants/workspace.constants.ts`, and `projects/middleware/src/modules/games/games.repository.ts:11`.

There are **19 configured source entries, 18 unique URLs**, counting the duplicated HSR Version entry. Two files fail the required `DataFile` shape. The runner casts parsed JSON to `DataFile` without validating it, so empty objects currently reach the default warning with an undefined ID and the process can still succeed.

Final Fantasy XIV is registered in the UI but has **no parser configuration**. It is outside the requested configuration-based scope; add it to a future onboarding backlog rather than implying an FFXIV parser exists.

## 2. Shared findings, ranked by priority

These findings apply to all five implemented classes, including Wuthering Waves if enabled.

| ID | Priority | Finding and consequence | Evidence / next action |
| --- | --- | --- | --- |
| S1 | High | Date-only cleanup expires records at UTC midnight; the UI includes the full local end day. Game-server reset instants are represented by neither convention. | `abstract-data-parser.ts:61`, UI `event-calendar.ts:4`. Define one end-exclusive contract with explicit server profiles; test cleanup and UI against the same occurrence. |
| S2 | High | Cleanup deletes records before source fetch/validation. Failure can leave no replacement; deleting expired parser records also removes the catalog behind the Ended filter. | `abstract-data-parser.ts:38`, `data-service.ts:111`. Stage and validate first; archive or mark ended instead of erasing history; preserve last successful data on source failure. |
| S3 | High | Title-only insertion blocks corrected dates/URLs and overlapping same-name cycles or banners. Cleanup by title can remove a retained occurrence sharing an expired title. | `data-service.ts:132,160`. Introduce stable activity and occurrence IDs; upsert mutable metadata and target exact occurrences. Preserve manual records and migrate progress mappings. |
| S4 | High | Configurations are not validated against dispatch, supported source IDs, or UI registry. Empty/unsupported games appear processed without producing data. JSON/file reads outside the per-game catch can abort later files on malformed input. | `main.ts`, `data-file.type.ts`. Validate a manifest before opening clients; explicitly distinguish enabled, planned, disabled and invalid configurations. |
| S5 | Medium | Callback failure is swallowed as `[]`; an empty listing and an extraction failure are indistinguishable. Navigation failures bypass browser close, and parse failures bypass DB disconnect. Per-game errors do not make the overall run fail. | `abstract-data-parser.ts:38,98`, `main.ts`. Use structured source results, `finally`, and an aggregated job outcome. |
| S6 | Medium | Shared classification contains Genshin-specific names. Missing end dates become Permanent before type mapping; Genshin/HSR/ZZZ discard those rows, while Wuwa retains them. | `abstract-data-parser.ts:204`, per-game `parseEvents()`. Separate availability from event kind, recurrence and tags; use game-specific classification maps. Unknown dates are not evidence of permanence. |
| S7 | Medium | Every insertion stage increments `_revision`, even with no new records. Same-title version corrections are ignored, and version writes do not increment that revision. | `data-service.ts:188,223`. Advance revisions only on actual changes; apply the same rule to all shared document updates and retain atomic concurrent deduplication. |
| S8 | Medium | Parsed IDs hash title, URL, type, dates and optional raw ID. Metadata corrections can change a user's progress key; period inclusion alone does not provide stable occurrence identity. | Middleware `game-document.ts:97`. Separate identity from mutable metadata; retain aliases or migrate old private progress keys additively. |
| S9 | Medium | Generated `/icons/...svg` paths have no matching shipped SVGs in this checkout. Ordinal banner icon names are not artwork or stable identities. | Parser `icon` assignments, `angular.json` assets input. Add verified generic assets or approved artwork with provenance and an asset-resolution test. External deployment assets were not inspected. |
| S10 | Medium | A browser is opened for each source, `headless` is hardcoded false, and readiness is a fixed ten-second wait. No checked-in parser schedule or source-health record was found. | Shared browser controller; package scripts/workflows. Configure browser mode, bounded readiness/retry, browser reuse, source timestamps and external scheduling documentation. |

The MongoDB service connects in its constructor, logs an asynchronous connection failure, and does not expose an awaited initialization contract to the runner. Prefer explicit lifecycle ownership so validation precedes connection and shutdown is guaranteed.

Keep the existing good boundaries: parser defaults do not become shared player completion; manual event records are protected from parser cleanup; insertion includes an atomic duplicate check. Fix their limitations without losing those protections.

## 3. Captured data versus UI consumption

All implemented games use the same basic path:

`configuration -> parser -> shared root version/events -> middleware adapter -> WorkspaceStore -> dashboard and game Events page`.

| Parser field / derived value | UI usage | Coverage or contract gap |
| --- | --- | --- |
| `title` -> `name` | Titles, search, labels | Used, but should not double as the DB identity |
| `url` -> `wikiUrl` | Game event list/calendar opens HTTP(S) source link | Dashboard rows open the game's Events page, rather than the external source directly |
| `startDate`, `endDate` | Status tabs, calendar, countdown, urgency, deadline ordering | Time-zone precision and participation versus claim boundaries are missing |
| `eventType` -> `category` and `eventType` | Badges and filters | One classification mixes cadence, content kind and availability; no multi-tag model |
| `icon` | Thumbnail with failure fallback | Most generated paths have no tracked asset; no source artwork extraction |
| `completed: false` | Removed from shared writes; personal completion is loaded separately | Redundant parser output, correctly not an account-progress source |
| Root `version.title/releaseDate/url` | Not included in normal `GameSnapshot`; raw `/parsed` API can expose it | No normal dashboard binding; no automatic story-guide patch update |
| In-memory `isNewVersion` | Assigned by all classes | No conditional behavior depending on it was found in these parsers |
| HSR `WeeklyLinked` | Label/filter value | No reward-group identity or linked completion/limit behavior |
| `_revision` | Optimistic concurrency | No-op churn increases conflict risk; not an event freshness timestamp |

Evidence: `projects/lib/types/data-collections.type.ts`, `workspace.type.ts:57`; middleware `game-document.ts` and `games.repository.ts`; UI `core/state/workspace.store.ts`, events `events.ts`, `event-calendar.ts`, and dashboard `dashboard.ts`.

The parser currently supplies **event checklists**, not character, weapon, skill, inventory, team, farming-requirement, or story-guide datasets. Those shared/user features do not automatically gain data just because a game has a parser config.

The browser loads catalog snapshots; it does not subscribe to parser database writes. A running parser does not by itself refresh an already open dashboard. Define a refresh/polling or notification policy with source freshness indicators rather than silently serving stale schedules.

### Required ownership boundary

Shared definitions: activity name, stable ID, source, server applicability, occurrence window, reset rule, participation requirements, stages, reward definitions, featured characters/weapons, and artwork provenance.

Personal state: completion, stars/scores, rewards claimed, stamina balances, pull history/pity, selected targets, pass ownership, crafting uses, purchase counts, and character builds. Public scraping cannot infer these values for an account.

## 4. Per-game findings and activity gaps

### 4.1 Arknights: Endfield

**Implemented output:** the wiki homepage's Version link supplies title and URL, with an empty release date. The Version branch generates four calendar tasks: Stock Redistribution, Daily Routine, Stamina Spend, and Weekly Routine. No event-list or summoning source is configured. UI consumption is limited to the four routine records; root version metadata is not displayed through the normal catalog.

| Area | Coverage / gap |
| --- | --- |
| Version | Link extraction only; no release/maintenance dates, version calendar, next version, or freshness |
| Summoning | No Chartered/RE-Factor headhunting or weapon Arsenal Issue ingestion; no featured items or distinct phase identities |
| Daily/weekly | Three daily and one weekly checkbox; no detailed objectives, usage/reward counts, or verified server reset profile |
| Events and passes | No normal, login, trial, Protocol Pass, or limited challenge event extraction |
| Challenge/endgame | No season/cycle definitions for Etchspace Salvage or Umbral Monument-related activities; permanent gameplay and limited reward campaigns need separate availability models |

**Confirmed defects:** `arknights-endfield.ts:167` casts `versionInfo[0]` without checking it. A missing header/link or empty browser result is passed to `updateVersion()`, which dereferences `version.title`; generation is skipped after that failure. `Stamina Spend` has an empty source link, so the game event page cannot navigate from it. Static tasks are unnecessarily coupled to version extraction. There is no dedicated test suite.

**Next:** guard empty version results, decouple routine generation, add a tested official-news adapter for event/character/weapon banners, then add season/cycle and pass definitions. Prioritize first-class server and relative-boundary support: an [official headhunting notice](https://endfield.gryphline.com/en-us/news/7012) ends at the next maintenance rather than a fixed date, and an [official weapon issue notice](https://endfield.gryphline.com/en-us/news/6178) ties its duration to multiple headhunting banners. These should not receive invented six-week deadlines.

[Official version notes](https://endfield.gryphline.com/en-us/news/9560) distinguish permanent challenge updates, limited challenge rewards, staged content unlocks and Protocol Pass content. Treat those as separate definition/occurrence relationships; do not expire an entire permanent mode because a bonus event ends. [Official developer notes](https://endfield.gryphline.com/en-us/news/2662) also reference Etchspace Salvage and Umbral Monument. Exact current reset rules still require verification.

### 4.2 Fate/Grand Order

**Implemented output:** none. `fate-grand-order.json` declares one **US** event-list source, but there is no parser class, export or dispatch. FGO is absent from `GAMES`, so implementing ingestion alone would still leave its records inaccessible through supported game routes.

| Area | Required coverage |
| --- | --- |
| Releases | NA/US maintenance, story additions and campaign notices; do not require another game's numeric patch model |
| Summoning | Pickup banners, rotating rate-up subperiods and paid/special summon categories; no current implementation |
| Daily/weekly | Optional daily quests/login/AP-spend reminders and weekly Master Missions; all absent |
| Events | Event/campaign windows, story participation requirements, shop/reward deadlines, raids and time-gated unlocks where applicable |
| Challenge content | Event-specific challenge/high-difficulty content where announced; do not invent an Abyss-style universal monthly mode |

**Next:** use the configured US scope as the explicit baseline, validate it against official USA notices, then add a registry ID, root-document mapping, runner adapter and fixtures together. Never derive a US schedule by shifting a JP calendar. [The official USA gameplay guide](https://fate-go.us/howtoplay/images/How_to_Play_Fate_Grand_Order_Official_USA_Website.pdf) documents daily quests and weekly Master Missions; verify current reset details before implementing them. [Official campaign notices](https://fate-go.us/9th_anniversary/campaign/) distinguish summon and login windows, and [official pickup schedules](https://fate-go.us/9th_anniversary/) show that rate-up subperiods can differ from the overall campaign window. These support separate occurrence types, not one date pair per campaign.

### 4.3 Genshin Impact

**Implemented output:** Version, current wish links and generic event rows; seven generated tasks when a release date is usable: Daily Commissions, Trounce Domain, Paimon's Bargains, Spiral Abyss, Imaginarium Theater, Artifact Extraction and Artifact Definition. Without a usable in-memory release date, the five calendar tasks can still be built if the Version branch reaches generation.

| Area | Main gap |
| --- | --- |
| Version | First released row assumes newest-first ordering; no actual next-patch boundary or normal UI version binding |
| Summoning | Current table only; upcoming phases and Chronicled Wish lack dedicated coverage; character/weapon banners share one type |
| Daily/weekly | One commissions and one Trounce checkbox; optional resin/expedition/check-in routines and personal claim counts absent |
| Endgame | Abyss/Theater calendar anchors generated; server instants and results absent. Stygian Onslaught classification is conditional on source type text, not guaranteed ingestion |
| Events/passes/crafting | Generic rows only; unknown dates can be lost, artifact windows assume six weeks, no stage/reward/pass objective detail |

**Confirmed defects:** banner duration state survives an unrecognized later header; events split only on an en dash and read all matching wiki tables; missing end dates can be classified Permanent and filtered out. Static generation depends on the Version source. A fresh parser instance does not load the stored version as fallback. Detailed evidence and priorities are in the [existing Genshin review](genshin-parser-review-2026-11-12.md).

**Next:** fix shared retention/identity/time handling, isolate calendar generation, harden event and banner extraction, guarantee Stygian coverage, then add upcoming/Chronicled Wish and optional routines. [HoYoverse confirms](https://support.hoyoverse.com/hc/en-us/articles/50333950598553-When-does-the-Spiral-Abyss-reset-and-what-are-the-rewards) the Abyss/Theater monthly anchors but directs players to in-game countdowns for precise timing. Keep [Encounter Point alternatives](https://support.hoyoverse.com/hc/en-us/articles/50333944750105-How-do-Encounter-Points-work) within the same commission-reward goal instead of double-counting them as independent mandatory tasks.

### 4.4 Girls' Frontline 2: Exilium

**Implemented output:** none. The config is `{}`; no ID, source, parser, dispatch or UI registration exists.

| Area | Required discovery / implementation |
| --- | --- |
| Region and publisher | Select the supported publisher/server/locale before choosing sources or reset rules |
| Releases | Official maintenance/update notices and availability transitions |
| Recruitment | Limited doll and weapon recruitment occurrences, featured items and phase dates |
| Daily/weekly | Verified routine definitions and personal attempt/resource counters; nothing is generated |
| Events | Limited story, login, challenge, reward and claim windows; nothing is ingested |
| Endgame/competitive | Build a verified mode inventory for the chosen service before encoding mode names or recurrence |

**Next:** establish the intended service first. Both [Haoplay](https://gf2.haoplay.com/en/) and [Sunborn](https://gf2exilium.sunborngame.com/) have official sites; this report does not assume their schedules are interchangeable. A [Sunborn timed-login notice](https://gf2exilium.sunborngame.com/NewsInfo?id=417&typeId=4) provides explicit timezone and unlock requirements, illustrating fields the parser should preserve. That notice does **not** validate endgame reset schedules.

Expansion Drills, Peak Value Assessment and Gunsmoke Frontline are **source-research candidates**, not verified current mode/schedule commitments in this audit. Validate current terminology, service availability, replacements and any retired modes against official notices/in-game records before enabling tasks. Add the game registry/API mapping and validated configuration with the implementation; an empty file must not count as enabled support.

### 4.5 Honkai: Star Rail

**Implemented output:** released Version row; generic Events; four history-table sources (Anomaly Arbitration, Apocalyptic Shadow, Forgotten Hall, Pure Fiction); five generated tasks (Daily Training, Echo of War, Embers Exchange, Currency Wars, Simulated Universe). Seven source entries contain the same Version source twice, so version fetching and five-task generation run twice per normal configured execution.

| Area | Coverage / gap |
| --- | --- |
| Version | Guards empty extraction and skips future rows; still assumes source ordering and does not surface version metadata in normal UI |
| Summoning | No configured Warp source or dedicated character/Light Cone/current/upcoming banner extraction |
| Daily/weekly/monthly | Basic reminders only; Trailblaze Power/assignments, individual reward claims, pass objectives and shop counts are absent |
| Endgame | Four dedicated sources, but each selects only the last history row; no inventory of all simultaneously active occurrences |
| Universe/reward relationships | SU and Currency Wars are labeled WeeklyLinked but have no shared reward-group semantics or detailed objective/result definitions; verify relationships rather than inferring them from the enum |
| Events/pass/login | Generic table extraction only; no stages, eligibility, distinct claim deadline or dedicated pass/login source |

**Confirmed defects and risks:**

1. Remove the duplicate Version entry after validating source uniqueness; current repeated insertion calls also cause no-op revision churn (`honkai-star-rail.json`, `honkai-star-rail.ts:33`).
2. `parseTreasuresLightward()` selects `tbody tr:last-child` rather than selecting by valid active/upcoming periods. A future row, footnote or changed ordering can hide current content; overlapping live phases cannot both be represented (`honkai-star-rail.ts:204`).
3. GMT offsets are normalized before parsing, but `format(..., DATE_FORMAT)` then converts the instant to the parser host's calendar date and discards time/offset. This can shift dates and misstate deadlines. End-before-start is not explicitly rejected.
4. The generic event classifier remains Genshin-centric; HSR-specific passes/content need explicit mappings rather than relying on Temporary fallback.

**Next:** deduplicate config, keep every applicable occurrence with source period identity, preserve timezone-aware boundaries, add Warps, and explicitly model Universe variants/reward relationships and pass objectives. [Official HSR update notes](https://hsr.hoyoverse.com/en-us/news/166468) distinguish Anomaly Arbitration, the other Treasures Lightward modes, Currency Wars and Divergent Universe; the same notice illustrates changed phase sequencing/duration. Do not impose one universal endgame cadence or infer that every history table's last row is the only live phase.

### 4.6 Neverness to Everness

**Implemented output:** none. The config is `{}` and there is no parser, export or dispatch. `nte` already exists in the UI/API registry, so it is a practical first target among the wholly missing implementations.

| Area | Required coverage |
| --- | --- |
| Version | Official update/maintenance identity, actual availability boundary and source timestamp |
| Summoning | Separate character Limited Boards and Arc Research occurrences, reruns and upcoming periods |
| Events | Timed login/campaign activities, participation requirements, stage releases and separate redemption deadlines |
| Daily/weekly | Research current routine names, server rules and optionality before generating tasks |
| Challenge/endgame | Inventory actual modes and distinguish permanent releases, recurring seasons and limited bonus campaigns; no blanket cadence is verified here |
| Personal progress | Board/Arc choices, pulls, reward milestones and activity progress remain per-user |

**Next:** fill the configuration with explicit source IDs and a server profile, then implement official-news extraction with representative fixtures. [Official 1.5 notes](https://nte.perfectworld.com/en/article/news/gamenews/20261109/264948.html) provide separate character and Arc availability, requirements, timed content and Anomaly Pilgrimage additions. They are an appropriate initial source contract, but a permanent stage addition does not prove a recurring endgame reset. Do not borrow Genshin's reset calendar or weapon terminology for Arc Research. Enable only the categories whose current schedules can be validated.

### 4.7 Wuthering Waves

**Implemented output if invoked directly:** Version, generic Events, Doubled Pawns Matrix, Tower of Adversity, Whimpering Wastes; four generated tasks (Daily Activities, Weekly Challenge, Fantasies of the Thousand Gateways, Shop Reset). **Actual normal-run output: none**, because dispatch is commented out. Tests call methods directly and cannot detect this integration gap.

| Area | Coverage / gap |
| --- | --- |
| Version | Picks first three-column row without checking that release is valid/past; same unguarded empty-result cast as Endfield/ZZZ |
| Convene | No dedicated Resonator/weapon banner source, featured items, reruns or upcoming phases |
| Daily/weekly | Four coarse definitions; no Waveplate/resource counters, detailed claims, pass objectives or verified server reset policy |
| Endgame | Three dedicated handlers exist; Tower/Wastes subtract 28 days from reset text and call the result Monthly |
| Events | Broad article-table extraction, fixed columns, en-dash duration split; retains Permanent/unknown-end rows unlike other generic parsers |

**Confirmed defects and risks:**

- `wuthering-waves.ts:27` non-null-asserts a configured Version source, while the source loop later warns that the very same Version source is unknown because it has no matching switch case.
- `getVersionInfo()` can select an unreleased version and passes an absent result into `updateVersion()` (`:115`).
- Matrix parsing splits text on every hyphen and calls `format(new Date(...))` before checking validity (`:233`). ISO date ranges or malformed text can throw before the intended fallback, and internal date hyphens are ambiguous separators.
- Tower/Wastes synthesize a 28-day start and use the reset day as an inclusive end (`:278`, `:323`). Even when a 28-day period is correct, the next reset instant should be end-exclusive. A 28-day cadence is not a calendar month; classification should separate Endgame from recurrence.
- Mode/source currency needs review. Current official notes mention **Endstate Matrix**, while the configuration/handler says **Doubled Pawns Matrix**. This is a verification gap, not evidence that they are aliases. Do not rename one into the other without validating the source and identities.

**Next:** fix guards and date parsing, establish supported mode names and actual windows, upgrade extraction fixtures, then re-enable dispatch with a runner test. Add Convene sources afterward. [Kuro's notes](https://wutheringwaves.kurogames.com/en/main/news/detail/2154) identify Fantasies as weekly gameplay; [later notes](https://wutheringwaves.kurogames.com/en/main/news/detail/3194) distinguish Wastes sections and Tower zones. [More recent official notes](https://wutheringwaves.kurogames.com/en/main/news/detail/5571) reference Endstate Matrix. Preserve those distinctions rather than collapsing every mode into one monthly checkbox.

### 4.8 Zenless Zone Zero

**Implemented output:** Version, generic event rows, and four generated routines: Errands, Notorious Hunt, Hollow Zero, Signal Shop. The leading code TODO is not implemented coverage.

| Area | Coverage / gap |
| --- | --- |
| Version | Finds first released row, but does not guard an empty result before writing |
| Signal Search | No dedicated Agent/W-Engine or Bangboo/reference banner source, featured-item metadata or upcoming phases |
| Daily/weekly/monthly | Four coarse checkboxes; no Battery Charge/optional routines, reward counts, specific pass objectives or purchase quantities |
| Endgame | No dedicated Shiyu Defense or Deadly Assault schedule ingestion; Hollow Zero only has a generic weekly checkbox |
| Events | Generic wiki rows only; no stage/claim deadlines, requirements or dedicated login/pass coverage |

**Confirmed defects:** empty version extraction can abort static generation and later Events processing (`zenless-zone-zero.ts:179`). Event rows use **`icons/genshin-impact/...`**, not the ZZZ namespace (`:214`). Generic date/permanent classification defects are shared with Genshin/HSR. No dedicated parser test suite exists; a copied comment even refers to Genshin event parsing.

**Next:** guard version failure, correct icon mapping, add ZZZ extraction/controller tests, then implement Signal Search and explicit Shiyu/Deadly Assault occurrences. Keep stage scores/rewards personal. [Official ZZZ notes](https://zenless.hoyoverse.com/en-us/news/165414) distinguish Shiyu Defense, Deadly Assault and Hollow Zero with phase-specific content. Do not treat the existing Hollow Zero reminder as coverage of all three.

## 5. Configuration/source appendix

These are repository-configured sources, not an endorsement of their current selector compatibility:

| File | Configured source IDs and URLs |
| --- | --- |
| Endfield | `Version` -> `https://endfield.wiki.gg/` |
| FGO | `Events` -> `https://fategrandorder.fandom.com/wiki/Event_List_(US)` |
| Genshin | `Version`, `Banners`, `Events` -> `https://genshin-impact.fandom.com/wiki/Version`, `/wiki/Wish`, `/wiki/Event` |
| GF2 | No sources |
| HSR | `Version` -> `https://honkai-star-rail.fandom.com/wiki/Version` **twice**; `Events` -> `/wiki/Events`; `Anomaly Arbitration` -> `/wiki/Anomaly_Arbitration/Stages`; `Apocalyptic Shadow` -> `/wiki/Apocalyptic_Shadow/Stages`; `Forgotten Hall` -> `/wiki/Forgotten_Hall/Stages`; `Pure Fiction` -> `/wiki/Pure_Fiction/Stages` |
| NTE | No sources |
| Wuwa | `Doubled Pawns Matrix` -> `https://game8.co/games/Wuthering-Waves/archives/572518`; `Events` -> `https://wutheringwaves.fandom.com/wiki/Event`; `Tower of Adversity` -> `https://game8.co/games/Wuthering-Waves/archives/453474`; `Version` -> `https://wutheringwaves.fandom.com/wiki/Version`; `Whimpering Wastes` -> `https://game8.co/games/Wuthering-Waves/archives/498614` |
| ZZZ | `Version`, `Events` -> `https://zenless-zone-zero.fandom.com/wiki/Version`, `/wiki/Event` |

Representative live fetch checks returned 402 for the Genshin pages, HSR Events/Anomaly Arbitration, ZZZ Event, Wuwa Event and all three Game8 pages; Endfield wiki returned 403. The FGO US event list was readable through the browsing service, though its retrieved snapshot was not established as current. Several official sites exposed useful indexed notices; the Sunborn app shell required JavaScript. These are browsing-tool observations, **not** proof that production Puppeteer will behave identically.

Live source acceptance must check status codes, intended headings, sample row meaning, date parsing, origin/locale, and freshness in the actual browser environment. Do not treat a page title, HTTP 200, or a nonempty unrelated table as successful ingestion.

## 6. Tests and verification

Validation at this review: **107 tests pass in five suites**; `npx tsc -p projects/data-parser/tsconfig.lint.json --noEmit` passes; `npx eslint projects/data-parser/src --quiet` passes. Quiet lint establishes no errors, not zero warnings.

| Suite / integration | Current assurance | Missing assurance |
| --- | --- | --- |
| Genshin | Dispatch, HTML callbacks, source fields, routines and monthly boundaries | Real current source contract, cleanup boundaries, recurrence upserts and banner-category coverage |
| HSR | HTML callbacks, version filtering, routines, four history-source variants and GMT normalization | Config duplicate detection, all active periods, exact-time retention, Warps |
| Wuwa | Ten tests covering direct task/event/reset handler calls and mocked dispatch | Actual runner enablement, realistic DOM/source fixtures, version extraction, malformed Matrix dates |
| Endfield / ZZZ | No dedicated suites | Empty version guards, correct namespaces, routines, extraction and full controller paths |
| Data service / utilities | Mocked MongoDB operation shapes, persistence boundaries and utility examples | Real MongoDB pipeline/race/no-op behavior, archive/history and stable progress migration |
| Runner / configuration inventory | No inventory/registry test found | Every enabled config validates, dispatches exactly once and reaches supported UI/API identity |
| FGO / GF2 / NTE | No implementation tests | Full onboarding and game-specific source/schedule fixtures |

The Puppeteer unit-test substitute throws on real browser launch; tests deliberately do not prove live page availability. Add a separate source-contract job and a disposable MongoDB integration job rather than making unit tests depend on external websites or production data.

## 7. Prioritized implementation plan

Every phase should produce a reviewable change with its own acceptance criteria. Do not bundle formatting cleanup into parser/data-model changes.

| Phase | Work / deliverable | Dependencies and acceptance gate |
| --- | --- | --- |
| 0. Protect and baseline | Export affected game documents and private progress; record config/dispatch inventory, event counts, representative IDs and source timestamps; define dry-run reconciliation output. | Before migrations or re-enabling parsers. Restore procedure is demonstrated on disposable data. No production deletion to make tests pass. |
| 1. Make support explicit | Introduce one registry with stable game key, document name, enabled/planned state, implementation and supported source IDs. Validate JSON files, duplicate sources, URLs and registry/API alignment before connecting. | All eight files are accounted for. Enabled entries fail clearly if invalid; planned entries are intentionally skipped. Wuwa status and empty placeholders are visible. |
| 2. Fix occurrences and time | Define stable activity/occurrence IDs, explicit server scope, end-exclusive boundaries and source provenance. Separate content kind, cadence, availability and tags. | Date-only compatibility is explicit; same-title cycles coexist, corrections keep progress, and old IDs have aliases/migration. Unknown end dates remain unknown. |
| 3. Make writes safe | Stage valid results, upsert occurrences, archive ended content, preserve manual records and private state, avoid no-op revision changes. | Failure cannot erase last good results. Two concurrent runs converge; unchanged runs do not increment revision; historical events remain browsable. Depends on phase 2. |
| 4. Harden execution | Use awaited DB initialization and `finally`; distinguish empty success from failure; configure headless/readiness/retries and aggregate run status; log per-source counts and freshness. | Navigation/parse/write errors close resources and produce actionable failed/partial job outcomes. Add reset-aware scheduling with external scheduler ownership documented. |
| 5. Repair active parsers | Endfield/ZZZ empty-version guards and tests; ZZZ icon namespace; HSR duplicate config and history-row selection; Genshin banner-header and event-date defects. Decouple routine generation from version sources. | Each active parser has controller, extraction and failure fixtures. Supported static routines still generate when version extraction is unavailable without inventing patch dates. |
| 6. Restore Wuwa | Validate source/mode currency, version guard, range parsing and exact reset boundaries; then enable runner dispatch. | Realistic fixtures, runner smoke, valid source results and preserved player progress. Do not simply uncomment before these gates. |
| 7. Fill major activity gaps | Endfield event/headhunting/weapon/pass/challenge sources; HSR Warps and all applicable endgame periods; ZZZ Signal Search/Shiyu/Deadly Assault; Genshin Stygian/upcoming/Chronicled Wish; Wuwa Convene. | Source-backed categories, current/upcoming windows and region profile verified per game. Shared schema handles relative or unknown deadlines. |
| 8. Add missing integrations | NTE first if prioritizing games already visible in the UI; FGO US and GF2 after registry/publisher choices. Implement configs, classes, dispatch, fixtures and UI identity together. | No "supported" claim until basic version/update, banner/event and approved routine coverage passes end-to-end. If product priority differs, reorder this phase explicitly. |
| 9. Add detailed tracking/UI | Opt-in routines, personal counters, shared requirements/rewards, artwork, pass identity, source/version display and refresh policy. | Only add captured fields that have a UI consumer or a documented pending use. Keep account-only values out of the shared catalog. |
| 10. Operational acceptance | Fixture tests, timezone matrix, disposable DB race/migration tests, source-contract job, full existing build/test gates and freshness alerts. | Required gates pass before unattended deployment; source outages flag stale data rather than silently emptying the feed. |

### Backlog that should be implemented first

1. **S1-S3: shared date, retention and identity fixes** with regression tests and additive migration design.
2. **Registry/config validation**, including intentional disabled/planned states, the HSR duplicate, and FGO/GF2 API registration requirements.
3. **Failure/resource safety**, Endfield/ZZZ empty-version guards and tests, and ZZZ namespace correction.
4. **Wuwa readiness and re-enablement**, followed by the missing active-game banner/endgame sources.
5. **NTE minimum integration**, then FGO US and chosen GF2 service; expand personal tracking only after the shared feed is dependable.

### Data contract to settle before coding migrations

Proposed additions, not current fields:

- Activity definition: stable ID, game key, content kind/subtype, optional tags, source identity, requirements and default recurrence rule.
- Occurrence: stable ID, activity ID, server/publisher/locale scope, start/end-exclusive/claim-end instants where known, status and precision/estimated flags, source timestamps and raw date text.
- Personal occurrence progress: account plus occurrence ID, completion/counters/reward claims, retaining mappings for existing `parsed-event-*` keys.
- Version/update record: stable source identity, display name, release/maintenance boundaries and provenance. Do not require every game to use numbered patches.

For relative deadlines such as "before the next update" or "after three banners," store the relationship and confidence. Resolve it when authoritative boundary data is available instead of fabricating a date to satisfy a required field.

Do not replace the catalog in one migration or drop player rows whose original event has ended. Back up, generate a dry-run mapping, retain old identifiers, verify counts/completion on disposable data, and only then reconcile production records.

## 8. Definition of done for an enabled game

- A validated config maps to exactly one parser and the intended UI/API document, with supported sources and explicit region scope.
- Version/update, relevant summon categories, standard events, recurring challenge modes and approved optional routines are either covered or explicitly marked unsupported with a reason.
- All applicable live/upcoming occurrences are retained; no last-row/title-only shortcut hides concurrent periods.
- Countdown, cleanup, recurrence and calendar agree on boundaries. Permanent content is not conflated with unknown dates or expiring reward windows.
- Re-running changes neither identities nor document revisions when content is unchanged. Corrections preserve completion; ended occurrences remain available according to retention policy.
- Failed sources retain last good data, record freshness and yield a visible job outcome. Resources close reliably.
- Every generated image resolves or intentionally uses a generic fallback. Source links and metadata have a documented UI consumer.
- Unit fixtures, runner/config checks, server-time boundary tests and disposable persistence tests pass. Existing application tests/builds remain passing when implementation work lands.

No new schedules, parser registrations, source migrations or database changes are implemented by this report.
