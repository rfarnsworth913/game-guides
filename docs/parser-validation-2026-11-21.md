# Parser validation November 21 2026

All eight configured games were run against live sources using headed Chrome, with the requested 10–30 second navigation delays and 10 second wait after loading each page. Final Fantasy XIV is excluded. Version information and two months of configured recurring tasks were generated for every game, but the complete refresh exited with status 1 because event coverage is incomplete.

The initial validation left the production database unchanged and exercised imports in disposable MongoDB. The subsequent live import below populated the configured database.

## Live import

The November 21 live run added **815 event records**. All 761 expected recurring occurrences for the two-month window are present, including the current configured server-day dailies for all eight parser games. The database still contains nine game documents. A comparison with the backup confirmed that every pre-existing event and all non-event catalog fields were preserved; decoded catalogs pass the UI validation checks.

| Game | New event records | Recurring occurrences covered | Daily records for the current server day |
| --- | ---: | ---: | ---: |
| Arknights Endfield | 195 | 193 | 3 |
| Fate Grand Order | 80 | 74 | 1 |
| Genshin Impact | 81 | 80 | 1 |
| Girls Frontline 2 | 79 | 71 | 1 |
| Honkai Star Rail | 98 | 94 | 1 |
| Neverness to Everness | 97 | 81 | 1 |
| Wuthering Waves | 100 | 84 | 1 |
| Zenless Zone Zero | 85 | 84 | 1 |

Parser writes now target the registered `_gameId`, so FGO and GF2 update the existing `game:fgo` and `game:gf2` documents. Missing registered games fail explicitly instead of creating invisible name-based duplicates. Current Star Rail endgame cycles also take precedence over overlapping historical version windows. All **214 parser tests** and TypeScript compilation pass; targeted lint has no errors.

FGO's configured UTC server day was already November 22 during the run, while the other profiles used November 21. Its first daily record therefore appears under November 22 in the UI's local-date view. This difference remains in the existing date-only display model.

The overall command exited with status 1 despite successful imports because dynamic coverage remains partial: Endfield omitted eight missing or invalid ranges; Genshin omitted one TBA end date; Star Rail's event list has an undated collaboration; Wuthering Waves' event list and Tower of Adversity layouts are unsupported; ZZZ omitted three TBA ranges. FGO, GF2, and NTE completed without source errors. Valid records were imported without clearing stored events. Final Fantasy XIV was not run.

The verified pre-import backup is `backups/parser-sync-2026-11-22T02-51-06-325Z/catalog.ejson`, with its checksum in the adjacent `manifest.json`. The timestamp is UTC. Detailed live results are in `tmp/parser-sync/live-run.json`, and the database comparison and recurrence checks are in `tmp/parser-sync/live-verification.json`. Refresh the Events page to load the imported records; existing filters and balancing preferences remain in effect.

## Full run results

These counts describe the original full run. The subsequent source checks below identified corrections; they are not a second complete eight-game run.

| Game | Version found | Recurring occurrences | Dynamic occurrences | Full run result |
| --- | --- | ---: | ---: | --- |
| Arknights Endfield | Sanctuary of Ink, released October 15 | 193 | 9 | Partial; eight missing or invalid date ranges |
| Fate Grand Order | App version 2.95.0, released November 13 | 74 | 0 | Misleading empty success; corrected below |
| Genshin Impact | 7.2, released November 4 | 80 | 24 | Partial; sixteen missing or invalid date ranges |
| Girls Frontline 2 | Official Steam update dated October 28 | 71 | 8 | Partial; one malformed historical banner date |
| Honkai Star Rail | 4.7, released November 11 | 94 | 11 | Partial; event list could not provide dated current events |
| Neverness to Everness | 1.5, released November 11 | 81 | 16 | Configured sources succeeded |
| Wuthering Waves | 3.8, released November 12 | 84 | 15 | Partial; event list and two endgame sources failed |
| Zenless Zone Zero | 3.3, released October 21 | 84 | 14 | Partial; three missing or invalid date ranges |

Counts cover configured activities, not every possible activity in each game. The FGO version is an App Store application version; GF2 uses the publisher's update title rather than a numeric content version. Generated future recurring tasks do not imply future dynamic event dates have been announced.

## Corrections verified after the full run

- FGO's current event list uses duration cards rather than the historical tables. The updated adapter retrieved six dated current or upcoming events from the live US page.
- GF2's historical banner date had its day joined to its clock (`2025/5/2118:59`). Normalization fixes it; replaying the saved EN banner source returns four banners without date warnings. Its saved event source returns four events.
- Navigation headings such as “Updates” no longer match “date” columns. Non-date captions and permanent activity tables are excluded from finite event schedules.
- Endfield's version-release tables are excluded from dynamic events. Replaying the saved page returns seven dated events and eight omitted rows. These include upcoming entries without end dates and a reversed historical date range.
- Genshin's corrected event-page replay returns seventeen dated events and one unresolved end date marked TBA. The other fifteen initial warnings were permanent activities, which are excluded from finite event schedules.
- Game8's article body is selected instead of its unrelated membership article. A month joined to its label is normalized, recovering one dated Endstate Matrix cycle from the saved page.
- Event classification uses whole summoning terms, so “Glittering Starwish” is not mistaken for a Wish banner.

Successful source snapshots and row-level omission details are retained for inspection, avoiding repeated website requests when testing extraction changes.

## Remaining work

1. **Wuthering Waves:** add an adapter for Tower of Adversity's reset-date layout and the current event-list layout. Tower's source publishes a reset date and cycle duration rather than a start/end table. Whimpering Wastes produces two matching rows which the importer deduplicates.
2. **Honkai Star Rail:** the fetched event page explicitly reports no current event and lists an upcoming collaboration without dates. Permanent activities should not receive invented end dates. Separate current Forgotten Hall cycles from broader historical version ranges: the source exposes overlapping ranges, and counting both as current tasks is misleading.
3. **Endfield, Genshin, and ZZZ:** distinguish genuine unpublished dates from unsupported source layouts using the omitted-row reports. Confirm dates before importing those omitted entries.
4. **Coverage:** successful parsing applies to configured sources only. FGO has no dedicated summoning source; ZZZ has no dedicated banner source. Add and validate those sources before claiming complete summoning coverage.
5. **Deployment:** verify the headed Docker/Xvfb setup on the NAS. Desktop browser success does not establish that the NAS job can access the same sources unattended.

## Validation evidence

- The full-run output passed checks for valid ordered dates, unique occurrence identities, valid HTTP URLs, released version dates, configured recurrence coverage, reported counts, and absence of personal completion fields.
- Real MongoDB imports were repeated for all eight games in a uniquely named disposable database on localhost port 27029. The second import left both data and revisions unchanged. Existing manual history, story content, characters, and separate player progress were preserved. The disposable database was dropped and its MongoDB process stopped.
- The normal middleware/API and Angular suites passed. All 210 parser tests passed after the extraction corrections. Browser fixture tests passed with Playwright. TypeScript compilation passed; targeted lint reported warnings but no errors.
- The production Angular build completed with existing stylesheet budget warnings.

Local run artifacts are ignored by Git:

- `tmp/parser-sync/all-games-validation.json`: complete live-run results and generated records.
- `tmp/parser-sync/final-audit.json`: structural audit of that full run.
- `tmp/parser-sync/import-validation.json`: isolated import results.
- `tmp/parser-sync/source-rechecks.json`: subsequent live source checks.
- `tmp/parser-sync/snapshot-validation.json`: saved sources replayed through the corrected extraction code.
- `tmp/parser-sync/source-pages/`: successful source snapshots with fetch timestamps and browser version.

Structural and persistence checks passing does not establish complete or semantically correct source coverage. The remaining source gaps above still prevent calling the overall refresh fully successful.
