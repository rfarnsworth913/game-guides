# Game Library and navigation

The library is the full game directory; the sidebar is immediate navigation. This replaces the old flat sidebar list without changing game IDs, image references, content or personal progress.

## Reused and replaced code

- Shared `GameRegistration`/`GameConfiguration`, `GAME_FEATURES`, workspace visibility checks, Auth0 authentication and all `/games/:game/:feature` routes remain authoritative.
- The existing three-tab Create/Edit Game dialog and standard image picker are reused.
- `GameLibraryPage` replaces the old dashboard-derived `GameCollectionPage`. `/games` remains a compatible library entry point, and `/library` is the canonical library URL.
- `GameCard` supplies grid/list presentation and accessible feature links. Feature icons and the game sidebar both use `GAME_FEATURES` and `canAccessFeature`.
- `GameNavigationPreferences` now owns account-scoped organization; `GameNavigation` owns feature-aware switching. `GameSwitcherControl` is deliberately lightweight so the root keyboard shortcut does not eagerly load workspace/catalog code.

## Views and behavior

Use `/library`, `/library/favorites`, `/library/pinned`, `/library/recent`, `/library/collections/:id`, and `/library/manage`. Browser history and refresh preserve the selected view. Grid/list and sort settings persist with personal preferences. Search matches titles, abbreviations, fuzzy subsequences and any of a game’s genres. Types and sort controls use existing form styling.

Cards show a neutral banner fallback and abbreviation fallback when artwork is absent or fails to load. Feature links honor enabled features and editor visibility. Card actions open the existing editor, change personal pins/favorites, or assign a game to multiple collections. Shared management controls are absent for players; the server continues to enforce editor authorization.

Library rendering starts with 48 cards/rows and offers additional batches. The responsive grid supports small screens; list view uses the same filtering/sorting logic. No virtualization package is needed for the current catalog. Search and filters reset the visible batch where appropriate.

The sidebar starts with Workspace (Dashboard and Events Calendar), then Games (Find a game and Game Library with an accessible-game count). Global pages show collapsible Pinned Games and Recently Used sections. Pins are manually ordered, initially showing eight with Show More; recent history shows five unpinned games. Selected-game pages retain their feature navigation below the workspace/game links. Favorites, collection management and editor game management remain in the library instead of adding more sidebar sections. Drag pin/collection handles to reorder, or use Alt + Up/Down. Collections reference games; removing one does not delete any shared or personal game data. Collection dialogs retain drafts until Save and ask to discard only changed drafts.

Ctrl/Cmd + K opens one global quick switcher, including on non-workspace pages. Arrow keys select a result, Enter opens it, Escape dismisses it and focus returns to the trigger. Search is focused on open. Recent games precede pins without duplicates for an empty query. The shortcut does not open a second navigation dialog over an existing editor: finish or cancel editing first, protecting local drafts.

Switching retains the current feature when accessible, then tries the destination game's last accessible feature, then Overview. New feature URLs never inherit another game's story fragments or query parameters. Reselecting the current game keeps the complete current URL. Game accents continue to come from the existing workspace theme logic. History is recorded after navigation, not when editing shared settings.

## Persistence and API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/games/library` | Public lightweight shared metadata; no game content arrays, character rules or progress. The UI filters workspaces according to visibility. |
| `GET /api/me/game-library` | Authenticated user's personal library snapshot. |
| `PUT /api/me/game-library` | Atomic revision-checked replacement of the authenticated user's preferences, memberships and ordering. |

The middleware derives ownership from authenticated credentials, never from a request body. New records use MongoDB `_id = user subject` in `${DB_COLLECTION}_game_libraries`, separate from shared games and `${DB_COLLECTION}_player_progress`. Existing database documents need no destructive migration. No live production data rewrite is required.

The proposed many small PATCH endpoints are consolidated into one validated GET/PUT snapshot contract to make multi-collection membership and ordering atomic. Duplicate pin IDs, memberships and collection IDs are rejected. Referenced game IDs must exist. Conflicting revisions return 409, including racing initial writes. The UI serializes optimistic saves and rolls back failed changes to confirmed state with a visible Reload action. Account changes clear the in-memory snapshot, abort old requests and ignore stale responses. Storage events refresh other tabs; server revision checks prevent overwriting concurrent edits. Removed games are pruned from returned personal references.

Guests retain browser-local navigation preferences under `gg-game-library-v2:guest`. Signed-in data is persisted on the account and cached under a subject-scoped browser key. Existing `gg-game-navigation-v1` favorites/recent history migrate into the guest library; favorites do not become pins. The old key remains intact. Because the legacy key has no owner, signed-in users explicitly choose **Import Browser Favorites** to associate it with their account. This avoids silently sharing another user's preferences on a shared browser.

Shared game configuration uses one required `genres: string[]` field (empty for unclassified games), plus optional `createdAt` and `updatedAt`. Search aliases are removed. Stored singular `genre` values are merged into the array on reads and during the backed-up `game-genres-v1` startup cleanup; retired `genre` and `searchAliases` fields are removed from canonical configurations. Creation stamps `createdAt`; subsequent edits preserve it and update `updatedAt`. Recently Added falls back to name order for legacy records without a documented creation date; no historical dates are invented.

## Compatibility decisions

- All current game feature URLs and API responsibilities are retained. The library does not rename `story`, `plans` or `dashboard` routes.
- Shared deletion remains non-destructive: the context action **Restrict to Editors** requires confirmation and preserves the game. Permanent deletion and cascading removal are intentionally not introduced as navigation functionality.
- Library browsing initializes only the lightweight metadata transport. Existing global dashboards and feature workspaces retain their established full-catalog snapshot transport while those domain stores are refactored separately. This keeps existing progress, migration and editing behavior intact.
- Collections support the existing compact icon picker, including symbol/URL/library selection. Uploading a new shared image still requires an editor; personal collection ownership does not grant shared upload permissions.

## Validation

Middleware tests cover ownership, authentication, reference validation, stale/racing revisions, search and feature fallback. Frontend tests cover a 300-game catalog, shared grid/list filters, route-driven collection/favorite views, personal pin ordering, disabled features, save rollback and account switching. Browser integration exercises lightweight loading, persistent favorites/pins/membership, account isolation, keyboard switching, mobile layout and existing shared game editing.

Run `npm test`, `npm run ui:build`, `npm run lint:ci`, and `npm run ui:e2e` with its isolated database prerequisite. The browser harness drops its temporary database, including personal library collections, during cleanup.

Verified November 26, 2026: tooling (1), middleware (117), Angular (409) and parser (227) tests pass. Production build and full isolated browser integration pass, including mobile overlay bounds, shared game editing and expired-session recovery. ESLint reports no errors; existing non-blocking warning cleanup remains separate. The initial production bundle is approximately 615 kB, within the existing budget.

## Acceptance coverage

| Guide criteria | Implementation / verification |
| --- | --- |
| GL-01–03 | Compact context sidebar, lightweight library metadata, shared grid/list filtering and sorting; 300-game rendering test. |
| GL-04–09 | Independent favorites and pins, manual pin/collection ordering, automatic recent history, multi-collection membership, non-destructive collection deletion; persistence and account-isolation tests. |
| GL-10–12 | Global Ctrl/Cmd+K, name/abbreviation/genre/fuzzy matching, dialog-scoped keyboard handling and focus restoration; repeated-open keyboard regression test and mobile browser check. |
| GL-13–14 | Existing feature permissions/registry and workspace theme service drive navigation and accents; retain current accessible feature, otherwise remembered feature or Overview. |
| GL-15–18 | Account persistence with revision checks, editor-only shared mutations, unchanged identifiers/content, lazy artwork and missing-image fallbacks. |
| GL-19–22 | Bounded initial card rendering, existing feature routes retained, regression suite covering current workspaces, authenticated personal API unable to modify shared definitions. |

Deployment requires the updated middleware and frontend together. Restarting the middleware makes the new endpoints available; personal library documents are created on first authenticated save. Creation/update timestamps are written when games are edited. The startup genre cleanup backs up and updates only configurations with retired fields or a missing genres array; content and progress are untouched.
