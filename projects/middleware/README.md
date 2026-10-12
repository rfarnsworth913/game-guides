# Middleware

This local-development Node/TypeScript API uses the installed MongoDB driver and Node HTTP
server. No additional framework dependency is required. `npm start` launches the full stack;
`npm run middleware:start` launches just this service. MongoDB settings come from the same
root `.env` keys as `projects/data-parser/src/services/data-service.ts`.

The development launcher watches middleware and its imported shared TypeScript files, so
schema changes restart the API along with Angular's UI updates. After changing the launcher
itself, restart `npm start` once. This prevents a new UI from sending entry types to an older
API process that does not recognize them.

The service listens on loopback at `127.0.0.1:3001` by default. Angular proxies `/api/**`
through `projects/guides-app/proxy.conf.cjs`. Set `UI_PORT` and `MIDDLEWARE_PORT` in `.env`
to change ports. This is a local editing API, not an authenticated public deployment.

## Document layout

The configured collection has a unique index on string `name` fields. Startup refuses
duplicate game names instead of guessing which document to update. It does not merge or
delete pre-existing duplicates. UI IDs map to the parser's canonical game names.

```text
{
  _id: ObjectId(...),
  name: "Genshin Impact",
  version: { title: "3.8.0 Example", releaseDate: "2024-06-01", url: "https://example.com" },
  achievements: [{
    _id: "stable-category-id", title: "Category title", order: 1,
    icon: "", reward: "", rewardIcon: "", description: "", url: "",
    achievements: [{
      _id: "stable-achievement-id", title: "Achievement title", order: 1,
      icon: "", reward: "", rewardIcon: "", description: "", requirements: "", url: ""
    }]
  }],
  characters: [], events: [], inventory: [], plans: [], story: [], teams: [],
  _schemaVersion: 2,
  _revision: 4
}
```

Story guides use a horizontal, editable main-section menu per game.

Story guides open in standard mode, with navigation and completion checkboxes available.
The **Edit mode** switch reveals section/subsection creation, ordering, editing and deletion,
including template editors. It resets to standard mode on reload or when switching games;
changing modes does not write shared definitions or player progress.

Sections and subsections are global shared game content: titles, icons, ordering, topics,
guide content, and additions/removals apply to everyone using this database. Only story
completion is player-specific, currently stored in each browser's localStorage. Other
sessions see definition changes when they reload; there is no live synchronization or
account-based progress storage yet.

Each element of `story` has the following shape (MongoDB definitions contain no player completion state):

```text
{
  category: {
    _id: "stable-section-id",
    title: "Mondstadt / Version 1.0",
    order: 1,
    icon: "",
    content: {
      subsections: [ /* story definitions, with stable IDs and a topic in category */ ]
    }
  }
}
```

The API exposes main sections as `story-category` entries and subsections as `story` entries
linked by `storySection`. Topic IDs match the CSS palette: `patch-overview`, `main-story`,
`side-stories`, `world-quests`, `events`, `lore`, and `character-information`.
Subsections currently support a title, topic, guide notes, integer order and local completion;
topic-specific content templates can extend `content` later. Existing extra content fields
are preserved when section titles, icons or ordering change.

The `patch-overview` topic now has a structured `patchOverview` definition on its subsection:
`imageUrl`, `imageAlt`, `sourceName`, `sourceUrl`, and ordered `rows`. Optional `patchVersion`,
`patchTitle`, `releaseDate`, and `summary` populate the banner and patch information strip.
Users create, rename, reorder, and remove `groups` (`id`, `title`); no game-specific group
names are predefined. Rows reference their group using `groupId`. Removing a group keeps
its rows in the ungrouped Overview area. Legacy `contentType` values are retained and
converted to editable groups when an existing overview is edited.

The displayed columns are Completed, Content, Patch, and Notes (five physical columns).
Content can use a separate HTTP(S) `contentUrl`; Patch values are centered. Each row retains
its stable `id`, `content`, `patch`, `notes`, and optional `notesRight`. Omitting `notesRight`
merges Notes across two columns; providing it renders two separate cells. Content Type is
no longer displayed as a column. The left guide navigator links to each subsection and its
patch groups, and moves above the guide on narrow screens.
The banner uses a responsive 3:1 aspect ratio (recommended source size: 1200 × 400).
Row completion is held in the player's `storyRowCompletion` map inside `gg-player-v1`,
keyed by stable row ID. It is excluded from API writes and MongoDB, and included in browser
backups. Reordering rows preserves completion. A Patch Overview counts as complete when
all of its content rows are complete.

Legacy flat story records are migrated into a `General` section at middleware startup.
Old browser backups receive the same grouping on import, preserving IDs and completion.
Deleting a main section requires confirmation and removes its nested subsections; editing
a subsection can move it to another section in the same game.

Achievement categories contain their achievements directly. IDs remain stable across
migration, edits and moves, preserving local completion keys. Orders are stored as integers. Existing string orders are converted automatically at startup. Icons accept symbols or
URLs. Legacy nonempty notes are retained as an optional `notes` field.

Other arrays retain their existing record fields. Parser event records and manually authored
events share `events`; manual entries have `id` and `kind`, parser entries use their existing
`title`, dates, URL and event type. Parser records remain read-only in the UI adapter.
Unknown legacy root fields are preserved. The two internal metadata fields support schema
migration and optimistic concurrency. Version information remains owned by the parser.

Startup automatically migrates all existing documents, including parser-only games, and
removes the old `catalog` envelope. Before changing a document it saves the original, with
its original MongoDB `_id`, to `<DB_COLLECTION>_schema_v1_backup` in the same database.
Repeated startup skips schema-v2 documents whose orders are already numeric and does not overwrite backups. A concurrent
change aborts migration; restart to retry. Keep backups until you have verified your data.
To migrate without starting the UI, with MongoDB running, use `npm run middleware:migrate`.

The HTTP API continues to use flat entries for compatibility with existing browser backups.
The repository maps them to nested documents, and validates same-game references.
`completed`, `quantity`, and `target` remain in the browser's `gg-player-v1` state map;
parser writes strip these fields too. Migration removes old parser completion defaults.

Game saves atomically update root arrays using `_revision` in the update filter. Parser
appends and cleanup also increment this revision and use atomic array operations so neither
writer overwrites another writer's changes. No replica set is required. Imports across games
are sequential, not a cross-game transaction. Requests are capped at 8 MiB and resulting
game documents at 15 MiB, below MongoDB's 16 MiB document limit.

## API

| Method | Path                     | Result                                                             |
| ------ | ------------------------ | ------------------------------------------------------------------ |
| GET    | `/api/health`            | Service identity and database ping                                 |
| GET    | `/api/games`             | All game catalogs and revisions                                    |
| GET    | `/api/games/:id`         | One catalog and revision                                           |
| GET    | `/api/games/:id/parsed`  | Game document excluding MongoDB ID and internal metadata       |
| PUT    | `/api/games/:id/catalog` | Validate and save `{ revision, entries }`; return the new revision |
| GET    | `/api/games/:id/images` | List this game's uploaded images |
| POST   | `/api/games/:id/images?name=filename.png` | Upload raw image bytes with their image Content-Type |
| GET    | `/api/games/:id/images/:filename` | Serve an uploaded image |

Patch Overview's header and version background image pickers share a per-game library.
Uploads are stored in `projects/guides-app/src/assets/<game-name>/<image>` using lowercase,
hyphenated game names (for example `genshin-impact` and `arknights-endfield`). Filenames
include a unique suffix to avoid overwriting existing images. PNG, JPEG, WebP and GIF
are supported, with a 10 MiB limit and signature validation. The middleware serves these
files immediately, without an Angular rebuild; keep the API available to display them.
Only image references are saved in MongoDB. Back up the assets directory alongside the
database: browser JSON backups do not embed uploaded files. Uploads remain in the game
library even when an editing dialog is cancelled.

Game IDs: `genshin`, `hsr`, `wuwa`, `zzz`, `endfield`.
Invalid schemas/references return 400; unknown games 404; stale revisions 409;
oversized payloads 413; non-JSON writes 415; unavailable database 503.
Browser origins are restricted to the configured localhost frontend addresses.

The startup coordinator waits for MongoDB and API health before starting Angular,
reuses an existing database, and shuts down only processes it started. MongoDB logs go
to `projects/database/db/application-mongod.log`. Existing parser commands remain separate.

Use `npm run middleware:test`, `npm run middleware:check`, and `npm run ui:e2e` to validate.
