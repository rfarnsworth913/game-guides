# Middleware

This local-development Node/TypeScript API uses the installed MongoDB driver and Node HTTP
server. No additional framework dependency is required. `npm start` launches the full stack;
`npm run middleware:start` launches just this service. MongoDB settings come from the same
root `.env` keys as `projects/data-parser/src/services/data-service.ts`.

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
  version: ...,
  Event: [...],          // existing parser fields keep their current names and content
  catalog: {
    schemaVersion: 1,
    revision: 4,
    updatedAt: ISODate(...),
    inventory: [...],
    characters: [...],
    teams: [...],
    plans: [...],
    story: [...],
    events: [...],
    achievementCategories: [...],
    achievements: [...]
  }
}
```

Each definition has a stable ID, game ID, kind, title (`name`), and kind-specific fields.
Achievement `category` refers to the category's ID; counts are calculated by the client.
Character references and material requirements must resolve within the same game.
`completed`, `quantity`, and `target` are forbidden in API catalog writes and live only in
the browser's `gg-player-v1` state map. Parser data is available read-only under `/parsed`;
it is not rewritten into manually authored catalog entries.

Catalog writes replace only the `catalog` field, with a revision in the update filter.
This follows MongoDB's [single-document atomic update guidance](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/).
No replica set is required. Imports across games are sequential, not a cross-game transaction.
Requests are capped at 8 MiB and resulting game documents at 15 MiB, below MongoDB's
16 MiB document limit. Very large catalogs will eventually need a different storage layout.

## API

| Method | Path                     | Result                                                             |
| ------ | ------------------------ | ------------------------------------------------------------------ |
| GET    | `/api/health`            | Service identity and database ping                                 |
| GET    | `/api/games`             | All game catalogs and revisions                                    |
| GET    | `/api/games/:id`         | One catalog and revision                                           |
| GET    | `/api/games/:id/parsed`  | Existing parser-owned fields (excluding `_id` and `catalog`)       |
| PUT    | `/api/games/:id/catalog` | Validate and save `{ revision, entries }`; return the new revision |

Game IDs: `genshin`, `hsr`, `wuwa`, `zzz`, `endfield`.
Invalid schemas/references return 400; unknown games 404; stale revisions 409;
oversized payloads 413; non-JSON writes 415; unavailable database 503.
Browser origins are restricted to the configured localhost frontend addresses.

The startup coordinator waits for MongoDB and API health before starting Angular,
reuses an existing database, and shuts down only processes it started. MongoDB logs go
to `projects/database/db/application-mongod.log`. Existing parser commands remain separate.

Use `npm run middleware:test`, `npm run middleware:check`, and `npm run ui:e2e` to validate.
