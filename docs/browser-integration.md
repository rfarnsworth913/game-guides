# Browser integration

Run `npm run ui:e2e` with a local MongoDB instance available on `127.0.0.1:27017`. Set `E2E_MONGODB_URI` explicitly to use another test MongoDB instance. Install the Puppeteer browser first with `npx puppeteer browsers install chrome`; on Ubuntu, add `--install-deps` to install browser system libraries.

The command builds the real Angular application using the explicit `e2e` configuration, then starts a static UI server and the real API on automatically assigned loopback ports. It does not start, stop, or reconfigure your normal application or MongoDB server. The harness does not read `.env` or use `DB_NAME`, `DB_COLLECTION`, or production upload directories.

## Authentication boundary

The E2E Angular build replaces only the public Auth0 settings with synthetic `.invalid` settings. Production builds keep the normal Auth0 configuration. A fresh RSA keypair signs test access tokens for a synthetic issuer, audience, client, and subjects. The harness constructs the existing `Auth0Security` validator with its public-key parameter, just as the Auth0 unit tests do. The official bearer-token validator still enforces signatures, issuer, audience, expiry, and authorized client; the API still enforces the editor allowlist and origin checks.

No test authentication route, environment-variable bypass, or test signing key is added to production code. Test settings and generated private keys are confined to the harness. Browser requests use the actual Angular Auth0 SDK, with a pre-authenticated local-storage cache fixture. The fixture depends on the installed Auth0 SPA SDK cache format; an SDK upgrade may require updating this helper.

This suite does not test Auth0 hosted login, Google login, MFA, refresh-token rotation, or remote provider logout. Those need a separate dedicated test tenant/application. Unexpected external browser requests fail the suite. The provider logout URL is intercepted only by Puppeteer to return to the local application after the SDK clears its cache and cookies. Previously issued valid JWTs remain usable until expiry; the suite explicitly verifies this limitation.

## Isolation and cleanup

Each run creates a database named `game_guides_e2e_<random UUID>`. Catalog, schema backups, and player progress all live inside that database. The harness passes a temporary upload directory to `createApi`, and all browser contexts/profiles are disposable. It verifies guest and player accounts cannot edit shared data or upload assets, and it verifies a second account cannot see the editor's completion data.

Cleanup stops the browser/API/UI, verifies the generated database name and temporary-directory path, drops the entire test database, verifies no collections remain, and removes temporary uploads and profiles. Cleanup failures fail the command. A killed process cannot run `finally`; after an interrupted local run, inspect and remove only `game_guides_e2e_*` databases and `game-guides-e2e-*` OS temporary directories. The CI MongoDB service is discarded with its job even if the process is terminated.

Failure screenshots are saved to ignored `tmp/e2e-artifacts/`; no tokens or private keys are written to these artifacts.

## Coverage and CI

The suite verifies guest local completion and reload persistence; signed-in completion and restoration in a fresh context; account isolation; editor-only UI and API access; invalid signatures/claims; shared UI edits; real image upload/download/persistence; concurrent catalog and progress revision conflicts; browser logout; and cleanup. Ordinary API, Angular, and parser tests remain in `npm test`.

`.github/workflows/browser-integration.yml` runs this suite separately on Ubuntu with MongoDB 7 and Puppeteer's browser dependencies. After observing it pass on GitHub, add **Browser integration / browser-integration** to required branch checks alongside unit tests and lint. The workflow's presence does not itself configure branch protection. Keep provider-specific testing tracked separately; this automated suite is not a claim that hosted provider flows were exercised.

The obsolete cookie/session smoke implementation is no longer used by `ui:e2e`. `story-smoke.mjs` and `patch-smoke.mjs` remain legacy helpers and are not coverage for the current UI.
