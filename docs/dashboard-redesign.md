# Dashboard redesign

Implemented November 26, 2026. The supplied dashboard guide is the primary proposal; routes, feature IDs and progress identities remain compatible with the application.

## Global and game responsibilities

The global dashboard has one statistics bar, up to four Continue Playing cards, Today's Tasks, Ending Soon and compact personal goal summaries. The old Your Worlds, Story Progress and Quick Actions panels are removed. Continue Playing ranks games by the user's most recent actual progression changes, with a four-game limit; pins and browsing recency do not affect this order. Games with older saved progress but no timestamps remain eligible with a stable name-order fallback. Untouched games are excluded. An empty progression history links to Game Library.

Each game dashboard uses its configured identity/artwork, feature availability and workspace permissions. It can show Continue Story, today's calendar tasks, active events, patch progress, owned characters, inventory sufficiency, missing farming materials, achievements, personal goals, permanent end-game objectives and existing character guide links. Missing optional data does not create placeholder resource/activity/patch panels. Empty enabled features use compact states.

Statistics sum eligible story items and completions across games, rather than averaging percentages. Zero eligible items display N/A and no progress bar. Permanent end-game objectives stay in story progress; recurring activities stay in event progress.

Game Library and sidebar pinned/recent links open game dashboards. The quick game switcher retains its existing feature-preserving behavior. Visiting a dashboard updates game recency without overwriting the last meaningful feature. Continue Story uses the existing section and fragment links and account-scoped browser reading position.

## Data loading and permissions

Dashboards initialize only game registry metadata in WorkspaceStore. They never put partial catalogs into WorkspaceStore or use a partial catalog for editor writes. Other feature pages retain their existing full loading/editing flow.

Two independent, read-only projection endpoints allow events to load or fail separately from progression summaries:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/dashboard/summary` | Accessible game statistics, resume targets and compact feature summaries |
| `POST /api/dashboard/summary/:gameId` | The same projection scoped to one accessible game |
| `POST /api/dashboard/events` | Calendar events relevant to the current planning horizon |
| `POST /api/dashboard/events/:gameId` | Relevant events for one accessible game |

These use POST to accept device-local guest progress and reading positions without putting them in URLs. They do not save either payload. Authenticated requests always use the verified subject's ProgressRepository state; submitted state cannot override another account. Game and feature workspace permissions are applied on the server. Existing public catalog endpoints retain their established policy.

The browser receives aggregate story/achievement/collection/material counts and bounded summaries, not entire story, character, inventory or historical event catalogs. Middleware processes game snapshots with at most four concurrent game reads; one failed game does not suppress other games. Event windows include a small timezone margin and are interpreted by the same browser date helpers as the calendar. Optional version lookup failures do not hide progression summaries.

The projection endpoint is not an invalidatable persisted cache. No schema migration, new collection, record deletion or completion-key change is required. At substantially larger scale, MongoDB field projections/server aggregation or an invalidatable server cache can further reduce middleware work; browsers already avoid full catalog transfers.

## Calendar and completion integration

`event-planning.ts` is shared by the calendar and dashboard. It supplies the same 30-day horizon, manual pins, daily capacity, balance algorithm and saved-plan signature. Completion is excluded from the signature, preserving row placement after checking a task. The signature includes the calendar date policy so obsolete reset-day assignments are invalidated once; manual pins and settings are preserved.

Today's Tasks follows the corresponding global or game calendar's balance preference. When balanced, it shows only assignments to today; otherwise it uses the existing calendar availability rule for Today. Other calendar browsing filters do not silently remove dashboard tasks. Completed tasks remain visible and muted. View Schedule opens the existing list/Today calendar view. Ending Soon uses actual expiry, excludes completed/expired/upcoming events, defaults to three days, and is limited to five; `deadlineDays` is a configurable dashboard input.

Completion uses AccountProgressClient with its existing conflict handling, or GuestProgressStorage for guests. It updates the same canonical event and required-objective keys as the calendar, with local error display and no database-status/saving-message flashing. Navigating back loads current feature state. Dashboard projections refresh after writes, explicit retry and dashboard/account scope changes. Returning focus to the browser tab does not fetch or replace widgets. Cross-tab calendar-setting changes update scheduling selectors without reloading data. Superseded reads are canceled and responses from old scopes are discarded.

## Existing planner limitations

Legacy planner definitions are shared catalog records. They are not automatically counted as a user's personal plans. Dashboard goals include owned characters with saved targets and legacy plan definitions with an explicit saved personal target. Character goal percentages use the same configured progression-track calculation as character details. No personal-plan persistence system is invented by this redesign.

Global Create Plan therefore opens Game Library to choose a game; game-level Manage Goals opens the existing planner or character collection. Detailed materials remain game-specific. Resource links are existing shared character guides, not fabricated game links.

## Presentation and verification

Both contexts share section and progress components and a single scoped page/data adapter, rather than duplicate global/game widget implementations. Neutral theme surfaces, restrained accents, independent column heights, compact rows and lazy-loaded artwork match existing dialogs/pages. The desktop layout (at least 1100px wide and 700px tall) fits the available viewport: the welcome/statistics bars are compact, four short Continue Playing cards share one row, and long task lists or widget columns scroll internally. Smaller windows and mobile keep natural page scrolling so content stays accessible. Container queries still adapt the natural-flow layout to narrower content widths. Broken banner images are hidden rather than leaving a broken-image strip.

Coverage includes weighted progress/N/A, pins/recent ordering, feature visibility, game scope, actual deadlines, stable balanced completion, local failures, canonical guest/account writes, API account isolation, and permanent activity separation. Browser integration checks existing feature routes, no full catalog request from dashboards, bounded game cards, mobile overflow, and account completion restoration. Screenshots are generated in ignored `tmp/e2e-artifacts/dashboard-*.png`.

No dashboard customization editor, fabricated activity history, new scheduler, or second set of feature flags is introduced.

## Progression recency metadata

`ProgressSnapshot.gameUpdatedAt` stores an optional per-game timestamp map alongside account state. ProgressRepository updates it atomically with successful revision-checked progress saves, using the server clock; no-op saves and untouched default projections do not update recency. The map is isolated by the existing account document ID. Clients cannot submit account timestamps through progress updates. GuestProgressStorage records the same metadata in the existing device-local progress envelope. Dashboard summary requests accept guest timestamps only for guest projections; authenticated summaries always read the authenticated account's map.

Existing progress records and IDs are unchanged. Historical update times cannot be reconstructed, so there is no invented backfill. A game receives an authoritative recency timestamp on its next progress change.

## Task group presentation

Today's Tasks uses distinct game title bars with icons, completed/total counts and the standard chevron. Each group expands or collapses independently with a short animation and reduced-motion support. Collapsed content is inert for keyboard navigation. Rows and their completion state remain mounted while collapsed; toggling presentation does not write progress. In a game dashboard the redundant game header is omitted.

Lower panels use consistent group/row spacing and only grow to their content height; longer content remains constrained by the desktop layout. Continue Playing reserves consistent artwork space, including missing or failed banners, and aligns its action links along the bottom of each card.

Dashboard statistics, panels and banner artwork show accessible loading spinners while their data or images load. Content fades into place without replacing existing panel contents; unavailable artwork settles to the reserved neutral background. Reduced-motion preferences disable these transitions. Continue Playing uses slightly taller desktop banners and compact, right-aligned Continue Story links. The empty Plans & Farming panel places its message and action on one responsive row.

## Game-specific dashboard

`components/game-dashboard` owns the game presentation, while the existing dashboard page owns scope, calendar assignments and data loading. Both use the same `DashboardData` instance and shared section/progress/artwork/task components. The global layout remains separate; no additional endpoint, collection, dependency or migration is required.

The compact banner header integrates current version metadata and links to the patch matching its version number when configured. If no matching patch exists, version text remains unlinked. Editors receive the compact configuration control. Content-backed story and achievement statistics are hidden when no definitions exist, and all statistics obey feature visibility. Story resume uses the canonical saved location or next incomplete item, with distinct start/resume/review states.

Game widgets use independent 55/45 desktop stacks with internal scrolling and a single column on mobile. Today's Tasks uses existing date/balance/manual assignments, with incomplete tasks first and a closed completed group that supports reversing completion. Active Events shows at most five timed events ordered by deadline, omits daily/weekly/monthly/permanent entries and today's assigned task IDs, and offers upcoming and completed views. These exclusions affect presentation only, not aggregate timed event counts or underlying records.

Characters use configured headshots before existing icons, prioritize active goals, and link directly to the existing details query parameter. There is currently no per-character visit history in the application; characters without goals use stable name ordering rather than fabricated recency. A maximum of six are shown. Plans, inventory and farming share one panel while retaining separate feature routes and permissions. Material counts use the existing aggregate inventory requirement calculation, exclude unneeded materials and do not reuse the same owned quantity independently for each plan. Recipe/configuration issues remain visible rather than implying that missing cost definitions mean no requirements.

Permanent activities derive from existing Story Guide objectives, with four incomplete activities ordered by started progress and a collapsible completed group. They exclude event references and reset-clock records. Achievement categories prioritize partial progress, capped at three; resources reuse explicitly configured guide URLs and remain hidden when absent. Loading, request failure, empty and completed states remain distinct. Game changes filter every projection by ID and abort previous requests through the existing adapter.

Validation covers version/header integration, scope and permissions, empty-feature combinations, task reversal, timed-event deduplication, active/upcoming sorting, permanent objective priority, aggregate shared materials and configured character images. Browser integration checks desktop height, mobile overflow, task completion reversal and continued global dashboard operation.
