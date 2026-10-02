# Game Guides

A multi-game progression workspace for Genshin Impact, Honkai: Star Rail, Wuthering Waves,
Zenless Zone Zero, and Arknights: Endfield.

## Start the application

```sh
npm install
npm start
```

`npm start` (also `npm run ui:start`) starts MongoDB, waits for the middleware API, then
launches Angular at **http://localhost:4200**. Ctrl+C stops the processes it started.
An already-running MongoDB instance is reused and is not stopped when the app exits.

The root `.env` is shared with the data parsers. The existing configuration is used without
modification. For a new checkout, copy `.env.example` to `.env` and set:

```dotenv
DB_CONN_STRING=mongodb://127.0.0.1:27017
DB_NAME=gamesData
DB_COLLECTION=games
MIDDLEWARE_PORT=3001
UI_PORT=4200
```

MongoDB is launched from `projects/database/mongod.exe` on Windows when present, otherwise
from `MONGOD_PATH` or `mongod` on PATH. The launcher uses the existing
`projects/database/mongod.cfg`; if absent, it uses `projects/database/db`. A configured
remote MongoDB instance must already be running. Startup checks port availability and
reports configuration/startup failures rather than silently launching a partial stack.

## Data storage

Each game has one document in the same MongoDB collection used by the parsers. The
middleware adds a structured `catalog` field to that document; parser-owned fields such
as events and version information are preserved. Honkai: Star Rail uses the parser's
existing document name, `Honkai Star Rail`.

- MongoDB stores game definitions: inventory items, characters, teams, plans, story steps,
  events, achievement categories, achievements, their descriptions/rewards, and ordering.
- localStorage stores player state only: completion flags, owned quantities/current levels,
  target levels, and appearance preferences. There are no player accounts or cloud progress sync.
- Existing `gg-workspace-v1` data migrates on the first successful connection. Missing
  catalog entries are added, existing server definitions win, and player progress moves to
  `gg-player-v1`. The old key is removed only after every game has migrated successfully.
- Settings & backups, in the avatar menu, exports both definitions and local progress.
  Import updates shared game definitions in MongoDB and player state in this browser.
  Multi-game imports save one game at a time; an error identifies possible partial success.
- Shared-data saves use revisions. A stale session is asked to reload instead of overwriting
  another session's edits. If the backend is unavailable, definition changes are not reported
  as saved. Completion changes on already-loaded data remain local.

Use the same frontend origin (hostname and port) to retain the same local player profile.
`localhost` and `127.0.0.1` have separate browser storage.

## Features

Choose a game to open `/games/:game/:page`. Each game owns its inventory, characters,
teams, planner, events, farming, story guide, and achievements. The dashboard summarizes
progress across games. Material requirements are entered manually and farming shortages
are calculated against owned quantities.

Achievements support categories, reference links, descriptions, icon URLs, reward icons,
live search, collapse/expand, and drag ordering. Categories and achievements can be reordered
using drag handles or arrow keys; achievements can move between categories within a game.
Completing a plan removes its farming requirements without consuming inventory.

## Development and checks

| Command | Purpose |
| --- | --- |
| `npm start` / `npm run ui:start` | Launch the complete application |
| `npm run ui:only` | Angular only (requires middleware/database already running) |
| `npm run middleware:start` | Middleware only |
| `npm run db:start` | Start or reuse MongoDB |
| `npm run parser:start` | Run the existing data parsers |
| `npm run ui:build` | Production frontend build |
| `npm run ui:test -- --watch=false` | Frontend/store tests |
| `npm run middleware:check` | Middleware TypeScript check |
| `npm run middleware:test` | API validation tests |
| `npm run ui:e2e` | Full-stack integration test with temporary ports/collection and isolated browser profiles |

The end-to-end test checks startup/shutdown, actual database persistence, legacy migration,
parser-field preservation, separate browser progress, shared edits, and stale-write rejection.
It removes only its randomly named test collection. Historical scripts under `scripts/`
require an explicitly supplied disposable test server; use `npm run ui:e2e` for safe setup.

See [middleware documentation](projects/middleware/README.md) for the document schema and API.
