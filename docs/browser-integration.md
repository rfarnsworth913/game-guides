# Browser integration

Run `npm run ui:e2e` with a local MongoDB instance available on `127.0.0.1:27017`. Set `E2E_MONGODB_URI` explicitly to use another test MongoDB instance. Install the Puppeteer browser first with `npx puppeteer browsers install chrome`. On Ubuntu, installing system libraries requires root privileges. The CI workflow downloads Chrome as the runner user, then uses `sudo apt-get` to install the dependencies listed in that Chrome build's `deb.deps` file. Browser installation and tests continue to use the runner user's cache and permissions.

On Ubuntu runners that restrict unprivileged user namespaces, the workflow loads an AppArmor profile allowing user namespaces for the exact downloaded Chrome executable. This follows [Chromium's AppArmor guidance](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md). Chrome's sandbox stays enabled; the workflow does not disable AppArmor globally or pass `--no-sandbox`. A browser launch check runs before the full integration suite to identify runner setup failures early.

The command type-checks the E2E harness, builds the real Angular application using the explicit `e2e` configuration, then starts a static UI server and the real API on automatically assigned loopback ports. It does not start, stop, or reconfigure your normal application or MongoDB server. The harness does not read `.env` or use `DB_NAME`, `DB_COLLECTION`, or production upload directories.

## Authentication boundary

The E2E Angular build replaces only the public Auth0 settings with synthetic `.invalid` settings. Production builds keep the normal Auth0 configuration. A fresh RSA keypair signs test access tokens for a synthetic issuer, audience, client, and subjects. The harness constructs the existing `Auth0Security` validator with its public-key parameter, just as the Auth0 unit tests do. The official bearer-token validator still enforces signatures, issuer, audience, expiry, and authorized client; the API still enforces the editor allowlist and origin checks.

No test authentication route, environment-variable bypass, or test signing key is added to production code. Test settings and generated private keys are confined to the harness. Browser requests use the actual Angular Auth0 SDK, with a pre-authenticated local-storage cache fixture. The fixture depends on the installed Auth0 SPA SDK cache format; an SDK upgrade may require updating this helper.

This suite does not test Auth0 hosted login, Google login, MFA, refresh-token rotation, or remote provider logout. Those need a separate dedicated test tenant/application. Unexpected external browser requests fail the suite. The provider logout URL is intercepted only by Puppeteer to return to the local application after the SDK clears its cache and cookies. Previously issued valid JWTs remain usable until expiry; the suite explicitly verifies this limitation.

## Isolation and cleanup

Each run creates a database named `game_guides_e2e_<random UUID>`. Catalog, schema backups, and player progress all live inside that database. The harness passes a temporary upload directory to `createApi`, and all browser contexts/profiles are disposable. It verifies guest and player accounts cannot edit shared data or upload assets, and it verifies a second account cannot see the editor's completion data.

Cleanup stops the browser/API/UI, verifies the generated database name and temporary-directory path, drops the entire test database, verifies no collections remain, and removes temporary uploads and profiles. Cleanup failures fail the command. A killed process cannot run `finally`; after an interrupted local run, inspect and remove only `game_guides_e2e_*` databases and `game-guides-e2e-*` OS temporary directories. The CI MongoDB service is discarded with its job even if the process is terminated.

Failure screenshots are saved to ignored `tmp/e2e-artifacts/`; no tokens or private keys are written to these artifacts.

## Coverage and CI

The suite also launches the real middleware application entry on a temporary port, verifies database health and graceful shutdown, and loads every extracted global/game feature through the existing routes, including their deferred bundles. It verifies guest local completion and reload persistence; signed-in completion and restoration in a fresh context; account isolation; editor-only UI and API access; invalid signatures/claims; shared UI edits; real image upload/download/persistence; concurrent catalog and progress revision conflicts; browser logout; and cleanup. Ordinary API, Angular, and parser tests remain in `npm test`.

`.github/workflows/browser-integration.yml` runs this suite separately on Ubuntu with MongoDB 7 and Puppeteer's browser dependencies. After observing it pass on GitHub, add **Browser integration / browser-integration** to required branch checks alongside unit tests and lint. The workflow's presence does not itself configure branch protection. Keep provider-specific testing tracked separately; this automated suite is not a claim that hosted provider flows were exercised.

The obsolete scripts under `scripts/` and the unused middleware story, patch, and parser smoke helpers have been removed. `projects/middleware/scripts/stack-smoke.mjs` remains the active launcher for the maintained E2E suite. Parser persistence and legacy migration checks remain in the normal parser/middleware test suites.
