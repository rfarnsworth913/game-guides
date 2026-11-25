# Environment configuration

Copy the root `.env.example` to `.env` and run application/parser commands from the repository root. `.env` is ignored by Git; `.env.example` contains safe examples and is committed. Keep real database credentials and editor account IDs in your local configuration or deployment secret store.

The middleware, development launcher, database helper and Angular development proxy load the root `.env` through `dotenv`. The parser loads it when initializing its database service. Existing process environment variables take precedence: editing `.env` will not replace a value already exported by your terminal, container or scheduler. Restart the affected processes after changing configuration.

## Database

| Field | Required | Purpose |
| --- | --- | --- |
| `DB_CONN_STRING` | Yes | MongoDB connection URI shared by the API and parsers. Use a local, NAS or hosted MongoDB URI as appropriate. |
| `DB_NAME` | Yes | Database containing the shared catalog and application collections. |
| `DB_COLLECTION` | Yes | Shared game catalog collection. It does not rename every collection: account progress and schema backups use separate collections. |

The middleware and complete application launcher reject missing database settings. The database helper has a localhost URI fallback, but that does not make these fields optional for the application. The parser uses the same database target, so verify it before running a parser or migration.

For authenticated MongoDB connections, specify the correct `authSource` for the database where the user was created. Percent-encode reserved characters in the username/password portions of the URI; do not encode the entire URI. Quote values containing `#` in `.env` so dotenv does not interpret the remainder as a comment. Do not paste connection strings containing credentials into logs, screenshots or bug reports.

## Application and authentication

| Field | Default | Purpose |
| --- | --- | --- |
| `MIDDLEWARE_PORT` | `3001` | API listening port, also used by the complete application launcher and Angular development proxy. Must be an integer from 1 to 65535. |
| `UI_PORT` | `4200` | Angular port when using `npm start` / `npm run ui:start`. Also supplies the default `APP_ORIGIN` port when that field is absent. `npm run ui:only` runs Angular directly; pass `-- --port=...` to change its port. |
| `APP_ORIGIN` | `http://localhost:<UI_PORT>` | Browser application origin used by middleware origin checks and authentication configuration. Use only scheme, hostname and optional port, without a page path, query or fragment. |
| `AUTH0_EDITOR_SUBJECTS` | Empty | Comma-separated exact Auth0 user subject IDs permitted to edit shared data. An empty allowlist grants no editor access. These are user IDs, not email addresses. |
| `NODE_ENV` | Unset | Setting `production` enables production origin validation. |

The current middleware requires HTTPS for `APP_ORIGIN`, except HTTP on `localhost` or `127.0.0.1` outside production. An HTTP NAS LAN address is therefore not accepted by the current validation. `APP_ORIGIN` does not configure the server listening address, create TLS certificates, or change the Angular port. Keep the Auth0 application's allowed callback URLs, logout URLs and web origins consistent with the actual browser address; see [authentication setup](../projects/middleware/README.md#authentication-and-account-progress).

Auth0's public domain, client ID and API audience are defined in [`auth0-config.constants.ts`](../projects/lib/constants/auth0-config.constants.ts), shared by frontend and middleware. The Angular application does not read these values from `.env`; rebuild it after changing that constant. No Auth0 client secret belongs in the Angular application.

`OIDC_ISSUER`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` are obsolete and unused. `OIDC_EDITOR_SUBJECTS` remains a legacy compatibility fallback only when `AUTH0_EDITOR_SUBJECTS` is absent. Prefer the Auth0 field for all current installations; an explicitly empty Auth0 field also overrides the fallback.

## Local database launcher

`MONGOD_PATH` optionally selects the `mongod` executable for `npm run db:start` and the complete application launcher. If omitted, the helper uses the bundled Windows executable when available, otherwise `mongod` on PATH. An existing remote/NAS database must already be running; this setting does not start MongoDB on another machine.

## Parser automation

These optional overrides must be exported in the **shell, container or scheduler environment**. The current parser reads them before its database service loads `.env`, including during dry runs.

| Field | Default | Purpose |
| --- | --- | --- |
| `PARSER_HEADLESS` | `true` | Accepts exactly `true` or `false`. CLI `--headed` / `--headless` overrides the default. A headed browser needs a graphical session. |
| `PARSER_BROWSER_EXECUTABLE` | Browser selected by the CLI | Explicit browser executable path; otherwise the Chrome option uses Puppeteer's executable. |
| `PARSER_LOCK_PATH` | `projects/data-parser/.weekly-sync.lock` | Lock file preventing overlapping parser jobs. Keep its parent directory writable and use the same path for jobs that must not overlap. |

Use `npm run parser:preview` for a dry run, or `npm run parser:weekly` for the two-month update. A scheduler must set its working directory to the repository root and use the intended database settings. See [data parsers](data-parsers.md) for CLI options and lock recovery.

## Browser integration tests

`E2E_MONGODB_URI` is a test-only process environment override, defaulting to `mongodb://127.0.0.1:27017`. The browser integration harness does not read the normal `.env`; it creates a disposable database and supplies isolated application configuration. Use a test MongoDB instance. See [browser integration](browser-integration.md).

## Troubleshooting

- **Changes have no effect:** restart the relevant process and check whether its shell/container already defines the same variable. Check the working directory too.
- **Database authentication fails:** verify the target, user credentials, URI encoding and `authSource` without exposing the password.
- **Signed in but cannot edit:** verify the exact subject ID in `AUTH0_EDITOR_SUBJECTS`, then restart middleware. Signing in alone does not grant editor access.
- **Origin rejected:** ensure `APP_ORIGIN` matches the browser address and satisfies the HTTPS/localhost rules above.
- **Parser browser override ignored:** export it before launching the parser rather than relying on `.env`.
