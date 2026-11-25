# Shared game management

Editors open the expanded game selector and choose **Add Game**, **Manage Games**, or the edit icon beside a game. The API independently requires editor authorization for creation, configuration updates and the management registry.

The Overview tab contains title, genre (shown as Game Type), description, highlight color and icon/banner pickers. The Features tab lists modules alphabetically in full-width rows with a checkbox, icon, description and Public/Editors only selector. Visibility controls remain visible but disabled for unused features. The Advanced tab contains the immutable game ID, short name and game visibility. Missing feature keys mean the game does not use that module. Disabling a module preserves its content and personal progress. The dialog keeps its height when switching tabs; arrow keys, Home and End move between tabs without resetting drafts.

The editor has a fixed height of 90% of the viewport across all tabs. Its fields scroll independently while the header, tabs and bottom Save/Cancel actions remain visible.

Artwork selections preview in the editor. New uploads remain local until Save; creation precedes upload so images have a valid game owner. If an upload fails, the dialog retains the created game and draft for retry instead of creating a duplicate. An uploaded library asset remains if a later configuration save fails.

Validation checks required text, length limits, safe image URLs, unique/reserved IDs, supported feature keys, matching feature IDs, public/editor visibility and opaque highlight colors. Fields show errors and a focusable summary. Configuration revision conflicts return 409 without overwriting another editor's changes.

## Game document and configuration

The shared contract is `GameDocument` in `projects/lib/types/games.type.ts`:

```text
gameId
version
gameConfiguration
  name, short, subtitle, description, genre
  icon, banner, color
  features: { story?: { feature: "story", visibility: "public" | "editors" }, ... }
  revision, visibility
content
  achievements?, characters?, events?, inventory?, plans?, story?, teams?
```

The content array element types intentionally remain `unknown` pending the separate domain-type refactor. Existing nested achievements/story payloads remain intact. Character rules stay in their existing storage field for now; personal progress remains in the separate account collection or guest localStorage.

`GameRegistration`, defined alongside the other game contracts in `games.type.ts`, pairs configuration with `gameId` for registry/editor responses and save requests. It is a projection, not a second stored configuration. `GameSnapshot` remains the API's catalog projection during this transition and retains its own `id` field. The middleware adds MongoDB `_id`, `_schemaVersion: 3` and catalog `_revision`; configuration has its own independent `revision`. Legacy `name` and `_gameId` lookup fields remain for parser/image compatibility. Game-title edits do not change identity, image folders or account keys.

## Workspace visibility and public global data

- A public game dashboard is accessible to guests and signed-in players.
- An editor-only game requires an editor account, even if its feature configuration says Public.
- An editor-only feature requires an editor account within an otherwise public game.
- A missing feature is unavailable even to editors through normal workspace navigation.
- Sidebars and the game collection omit inaccessible games/features. Direct URLs are checked before a workspace mounts; access changes also hide an already-mounted feature and redirect.
- Shared catalogs, parsed data and image assets remain public, including data from restricted workspaces. Visibility is a workspace access rule, not confidentiality for shared definitions. Global calendars can continue using shared data from every game.
- Personal account data and all shared-data writes keep their existing authentication/authorization requirements.

There is no new game archive state or archive/restore editor action. Change visibility to Editors only to withdraw a workspace from public navigation. This does not remove its public shared data. The old DELETE endpoint is retained as a compatibility operation that changes visibility to Editors only.

## Existing database upgrade

On middleware startup, `GameRepository.initialize()` first performs existing compatibility migrations, then converts pre-v3 documents:

1. Determine the stable game ID, including known parser-only game identities.
2. Save the complete pre-v3 document in `<DB_COLLECTION>_schema_v1_backup`, identified by `migration: "game-configuration-v3"` and `originalId`. Its `original` field contains the backed-up document. Earlier schema backups are retained separately in that collection.
3. Convert `_gameOverview` into `gameConfiguration`, rename `gameType` to `genre`, and convert the feature array into a keyed map with public visibility.
4. Move existing game arrays into `content`, retaining row IDs, ordering, unknown payload fields and relationships. Only after the backup succeeds are the superseded top-level arrays and `_gameOverview` removed.
5. Map an old archived game to editor-only visibility; retain all its records and account progress.
6. Mark schema version 3 and preserve catalog/configuration revisions. Guarded writes reject concurrent changes; subsequent startups skip completed conversions.

Malformed configurations/content cause conversion to fail instead of silently replacing them with empty data. Take a complete database and uploaded-assets backup before upgrading production; the startup copy supplements it. Validation uses disposable test databases, not the configured application database.

Parser event append/cleanup supports nested `content.events` and legacy arrays. Version updates remain at the root. The maintained character/event/main-quest migration commands also select the appropriate old/new content paths.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/games` | Public shared game snapshots, including restricted-workspace definitions |
| GET | `/api/games/:id` | Public shared catalog projection |
| GET | `/api/games/:id/parsed` | Public parsed/shared document projection |
| GET | `/api/games/:id/workspace?feature=story` | Workspace access check; defaults to dashboard; unavailable feature 404, unauthenticated restriction 401, non-editor restriction 403 |
| GET | `/api/games/registry` | Editor-only configuration registry |
| POST | `/api/games` | Editor-only creation with a validated registration |
| PUT | `/api/games/:id/overview` | Editor-only configuration update with current configuration revision |
| DELETE | `/api/games/:id` | Legacy compatibility: set visibility to Editors only; body contains current configuration revision |

Creating a game does not automatically implement a parser for it. See the [application type checklist](application-type-checklist.md) for completed game contract definitions and the types retained for later cleanup.
