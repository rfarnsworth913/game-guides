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
to change ports. Configure Auth0 below to enable account sync and editor access.

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
completion is player-specific: guests use browser localStorage, and signed-in accounts use
a separate MongoDB collection. Account progress loads on sign-in/reload and saves on changes;
concurrent stale writes are rejected with 409. Other sessions see changes when they reload.

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

The image picker opens a separate library dialog with search, image-type filters, and
explicit selection confirmation. Banner position is stored with the story template.
"Save Details to Library" writes a JSON sidecar beside an uploaded image, containing its
friendly title, category, search tags, dimensions, description, and attribution. These details
are reused when selecting that image elsewhere. Include sidecars when backing up assets.
Use `PUT /api/games/:id/images/:filename` with a JSON details object to update them.

Game IDs: `genshin`, `hsr`, `wuwa`, `zzz`, `endfield`.
Invalid schemas/references return 400; unknown games 404; stale revisions 409;
oversized payloads 413; non-JSON writes 415; unavailable database 503.
Browser origins are restricted to the configured localhost frontend addresses.

The startup coordinator waits for MongoDB and API health before starting Angular,
reuses an existing database, and shuts down only processes it started. MongoDB logs go
to `projects/database/db/application-mongod.log`. Existing parser commands remain separate.

Use `npm run middleware:test`, `npm run middleware:check`, and `npm run ui:e2e` to validate.


## Authentication and account progress

The client-rendered Angular app uses the official `@auth0/auth0-angular` SDK for Universal
Login, sign-up, callback handling, silent token acquisition and logout. Auth0 access tokens
stay in the SDK's memory cache and are attached only to same-origin `/api/` requests.
The middleware uses Auth0's `express-oauth2-jwt-bearer` validator through an adapter for
its existing Node HTTP server. Tokens must have a valid RS256 signature, the configured
issuer and API audience, an unexpired lifetime, and this SPA's authorized client ID.
ID tokens are not accepted as API access tokens. The default app no longer uses the
older server-side `/api/auth/login` and `/api/auth/callback` routes or cookie sessions.

### Auth0 dashboard setup

1. Open **Applications > Applications**, select the app with client ID
   `eKDUQTPL8t5blNeq3rpK3rO88Bl5xUsx` in tenant `dev-pliiugqmxtabpg15.us.auth0.com`.
2. Change Application Type to **Single Page Application**, and set Token Endpoint
   Authentication Method to **None**. A client secret is not used by this SPA.
3. Set the following development URLs:

   | Auth0 setting | Value |
   | --- | --- |
   | Allowed Callback URLs | `http://localhost:4200/` |
   | Allowed Logout URLs | `http://localhost:4200/` |
   | Allowed Web Origins | `http://localhost:4200` |

4. Under **Applications > APIs**, create an API named **Game Guides** with Identifier
   **`https://game-guides/api`** and signing algorithm **RS256**. This identifier is a
   token audience; it does not need to be a reachable website. Configure user access for
   the SPA if your tenant requires explicit API client grants.
5. Public domain, client ID and API audience settings live together in
   `projects/lib/constants/auth0-config.constants.ts`, imported by Angular and middleware. If using an
   existing API, put its exact Identifier in `audience` there. Do not use the SPA client ID
   or the Auth0 Management API as this app's audience.
6. Set `APP_ORIGIN=http://localhost:4200` in root `.env`. Set `AUTH0_EDITOR_SUBJECTS` to
   comma-separated exact Auth0 user IDs (for example `auth0|...`) for trusted editors.
   Empty means no accounts can edit shared catalogs or images. The previous
   `OIDC_EDITOR_SUBJECTS` key remains a fallback for existing installations.
7. Restart `npm start` and consistently open `http://localhost:4200`. The coordinator
   checks port availability before launching Angular with its explicit port; it fails if
   the configured port is busy. Do not accept an alternative port without updating Auth0.
8. Open the avatar menu, choose **Sign up** or **Sign in to sync progress**, and verify
   your profile name appears after returning from Universal Login. Editor controls appear
   only for allowlisted accounts. Import browser progress through its explicit confirmation.

Application Type, allowed URLs, API creation, connections and user permissions must be
saved in the Auth0 dashboard. Local code changes do not update the tenant configuration.
The Auth0 MCP connection was not available in this session to apply those settings.

### Account data and authorization

- `<DB_COLLECTION>_player_progress` stores each account's validated progress and revision.
  Identity is derived from the verified issuer plus subject, preserving the same account
  key used by the previous implementation when the issuer value is identical.
- `GET /api/auth/session` returns the verified account and server-derived editor permission;
  requests without a bearer token return an anonymous account. Responses are not cached.
- `GET /api/me/progress` and `PATCH /api/me/progress` require a validated bearer token.
  Progress updates are deltas with revision checks; one account cannot select another
  account's data through client-supplied IDs.
- Catalog and image mutations additionally require an allowlisted editor subject and the
  exact `APP_ORIGIN` request origin. Public game definitions and images remain readable.
- Guest completion remains local. Signing in does not automatically import it. Account
  progress is not written into the guest localStorage key.
- Logout uses the Auth0 SDK to clear its local state and return through Auth0 logout to
  the configured origin. Previously issued API tokens remain valid until their expiry;
  logout does not revoke JWTs held elsewhere. Keep API token lifetimes appropriate.
- Existing legacy session collections are not deleted. They are unused by the default
  Auth0 API integration; the previous auth module remains only for compatibility tests.

### Deployment and validation

Serve Angular and `/api` from the same HTTPS origin. Set `NODE_ENV=production` and
`APP_ORIGIN` to the real browser origin. Add its callback, logout and web-origin URLs to
Auth0. This app does not enable Angular SSR. Authentication is initialized on the browser.
Never put a client secret or Management API token in Angular or the public configuration.
Keep Authorization headers and callback codes out of logs.

Run `npm run middleware:check`, `npm run middleware:test`, `npm run ui:test -- --watch=false`
and `npm run ui:build`. `npm run test:security` includes both legacy regression coverage and
Auth0 token validation tests. They check signatures, issuer/audience, expiry, authorized
client IDs, editor allowlists and origin checks without a live Auth0 tenant. A real login,
logout and API sync smoke test still requires the dashboard settings above and a browser.

References:
- https://github.com/auth0/auth0-angular
- https://auth0.com/docs/quickstart/backend/nodejs


## Middleware architecture

The backend remains one Node HTTP application with one MongoDB client/pool per process. No new framework or public endpoints were introduced. The Angular API contract and persisted MongoDB documents are unchanged.

```text
src/
  app/                    Startup, HTTP server factory, ordered route dispatch, API dependency ports
  config/                 Environment loading and allowed-origin checks
  core/
    auth/                 Security contract, fail-closed default, legacy regression implementation
      providers/          Auth0 bearer-token validation
    database/             MongoClient construction shared by runtime and migration entry points
    errors/               ApiError and uniform HTTP error handling
    http/                 Bounded JSON reading, JSON responses, per-server rate limits
  modules/
    auth/                 Provider-backed auth route dispatch
    health/               Health route and database ping
    games/                Catalog routes, controller, validation service, MongoDB repository
    progress/             Account progress routes, controller, orchestration, MongoDB repository
    images/               Image routes, controller, validation service/schema, filesystem repository
    characters/           Character progress validation
    inventory/            Inventory quantity validation
    teams/                Team ownership and capacity checks
    farming/              Existing shared farming regression tests
    documents/            Game document conversion and migrations
      stories/            Story conversion and completion-history validation
      main-quests/        Main/character quest document conversion
  tests/
    integration/          Auth, games, and image HTTP integration suites
    helpers/              Explicit test-only editor fixture
scripts/
  start.mjs               Development stack launcher
  database.mjs            Local database lifecycle helper
  stack-smoke.mjs         E2E type-check/build/runner launcher
  test.mjs                Cross-platform recursive middleware test discovery
  migrate.ts              Existing schema migration command
  migrations/             Existing backed-up quest migration command
e2e/                      Disposable database, signed-token and browser integration harness
```

`app/server.ts` applies response headers, rate limiting, and allowed-origin validation before routing. `app/routes.ts` preserves the original route order: provider auth handling, account progress, images, health, games. Route modules own method checks and authorization; controllers parse requests and return responses; services validate and coordinate work; repositories own MongoDB or filesystem persistence. Progress validation still applies to one complete request and commits through one existing account-progress revision check.

Auth0 uses `core/auth/auth.types.ts` for the application security contract and `core/auth/providers/auth0.provider.ts` for the provider. The legacy session/OIDC implementation is retained for its existing regression coverage; production startup continues to instantiate Auth0 only. Test fixtures and signing keys are not production authentication options.

`GameRepository` owns shared game documents and their schema backups, so it lives under Games rather than a generic database folder. `ProgressRepository` retains the existing account collection, revision handling and account keys. The image repository preserves the original `projects/guides-app/src/assets/<game>/` files, metadata sidecars, MIME handling, public URLs and upload limits. No live data migration or file move is required for this code reorganization.

Cross-application declarations remain in `projects/lib`; reusable game algorithms remain in `projects/common`. No duplicate backend shared-model layer or empty repositories were added for domains stored inside catalog/progress documents. `app/app.types.ts` contains the backend-only dependency ports used by routes and services.

### Commands and tests

Key source moves:

| Previous location | Current location |
| --- | --- |
| `src/main.ts`, `src/server.ts` | `src/app/app.ts`, `src/app/server.ts`; domain dispatch is in `src/app/routes.ts` |
| `src/config.ts` | `src/config/environment.ts` |
| `src/auth.ts`, `src/auth0.ts` | `src/core/auth/` contract/service/default and `providers/auth0.provider.ts` |
| `src/repository.ts` | `src/modules/games/games.repository.ts`; `ApiError` is in `src/core/errors/` |
| `src/progress.ts` | `src/modules/progress/progress.repository.ts`; orchestration is in `progress.service.ts` |
| `src/game-images.ts` | `src/modules/images/` routes, controller, service, schema, and filesystem repository |
| `src/game-document.ts`, story/quest helpers | `src/modules/documents/` and its story/main-quest folders |
| Root launchers and executable migrations | `scripts/` and `scripts/migrations/` |
| Flat HTTP tests and `src/test-support.ts` | `src/tests/integration/` and `src/tests/helpers/` |

Existing npm task names are preserved. Operational source paths moved, so prefer the npm commands over obsolete `src/main.ts`/`src/migrate.ts` paths.

- `npm run middleware:start` runs the new application bootstrap with watch mode.
- `npm start` and `npm run db:start` run the moved operational launchers.
- `npm run middleware:migrate` and `npm run middleware:main-quests -- <arguments>` retain their previous behavior. Backup/apply migrations were not run as part of this refactor.
- `npm run middleware:check` includes runtime code and TypeScript operational scripts.
- `npm run middleware:test` discovers every nested `src/**/*.test.ts` cross-platform. Unit/domain tests stay beside their code; HTTP suites and explicit fixtures live under `src/tests`.
- `npm run test:security` selects the same Auth0 and legacy security regression suites through the shared runner.
- `npm test`, `npm run ui:build`, and `npm run ui:e2e` remain the full project checks. E2E additionally exercises the real application entry against its disposable database.

### Deferred work

Existing lint/formatting debt is not silently disabled. The legacy session implementation can be retired in a separate decision once its compatibility/regression requirements are reviewed. Farming still uses canonical shared calculations and has no independent API or persistence; separate farming, inventory and character endpoints/collections are future features, not part of this refactor. Hosted Auth0 login and production deployment continue to require their separate integration setup.
