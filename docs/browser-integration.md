# Browser integration

Run `npm run ui:e2e` with a local MongoDB instance available on `127.0.0.1:27017`. Set `E2E_MONGODB_URI` explicitly to use another test MongoDB instance. Install Chromium with `npx playwright install chromium`; on Ubuntu use `npx playwright install --with-deps chromium` to install system libraries too. The application smoke harness and weekly parser both use Playwright. The legacy parser classes still use Puppeteer. Run `npm run parser:browser-test` for local source-extraction browser fixtures without MongoDB or external sites.

The Ubuntu workflow installs Playwright Chromium and its system dependencies before running parser browser fixtures and the application integration suite. Browser installation and host security-policy failures must be diagnosed separately from application test failures; the presence of a workflow file does not establish that a particular runner is configured correctly.

The command type-checks the E2E harness, builds the real Angular application using the explicit `e2e` configuration, then starts a static UI server and the real API on automatically assigned loopback ports. It does not start, stop, or reconfigure your normal application or MongoDB server. The harness does not read `.env` or use `DB_NAME`, `DB_COLLECTION`, or production upload directories.

## Authentication boundary

The E2E Angular build replaces only the public Auth0 settings with synthetic `.invalid` settings. Production builds keep the normal Auth0 configuration. A fresh RSA keypair signs test access tokens for a synthetic issuer, audience, client, and subjects. The harness constructs the existing `Auth0Security` validator with its public-key parameter, just as the Auth0 unit tests do. The official bearer-token validator still enforces signatures, issuer, audience, expiry, and authorized client; the API still enforces the editor allowlist and origin checks.

No test authentication route, environment-variable bypass, or test signing key is added to production code. Test settings and generated private keys are confined to the harness. Browser requests use the actual Angular Auth0 SDK, with a pre-authenticated local-storage cache fixture. The fixture depends on the installed Auth0 SPA SDK cache format; an SDK upgrade may require updating this helper.

This suite does not test Auth0 hosted login, Google login, MFA, refresh-token rotation, or remote provider logout. Those need a separate dedicated test tenant/application. Unexpected external browser requests fail the suite. The provider logout URL is intercepted only by the Playwright harness to return to the local application after the SDK clears its cache and cookies. Previously issued valid JWTs remain usable until expiry; the suite explicitly verifies this limitation.

## Isolation and cleanup

Each run creates a database named `game_guides_e2e_<random UUID>`. Catalog, schema backups, and player progress all live inside that database. The harness passes a temporary upload directory to `createApi`, and all browser contexts/profiles are disposable. It verifies guest and player accounts cannot edit shared data or upload assets, and it verifies a second account cannot see the editor's completion data.

Cleanup stops the browser/API/UI, verifies the generated database name and temporary-directory path, drops the entire test database, verifies no collections remain, and removes temporary uploads and profiles. Cleanup failures fail the command. A killed process cannot run `finally`; after an interrupted local run, inspect and remove only `game_guides_e2e_*` databases and `game-guides-e2e-*` OS temporary directories. The CI MongoDB service is discarded with its job even if the process is terminated.

Failure screenshots are saved to ignored `tmp/e2e-artifacts/`; no tokens or private keys are written to these artifacts.

## Coverage and CI

The suite also launches the real middleware application entry on a temporary port, verifies database health and graceful shutdown, and loads every extracted global/game feature through the existing routes, including their deferred bundles. It verifies guest local completion and reload persistence; signed-in completion and restoration in a fresh context; account isolation; editor-only UI and API access; invalid signatures/claims; shared UI edits; real image upload/download/persistence; concurrent catalog and progress revision conflicts; browser logout; and cleanup. Ordinary API, Angular, and parser tests remain in `npm test`.

`.github/workflows/browser-integration.yml` runs this suite separately on Ubuntu with MongoDB 7 and Playwright Chromium/browser dependencies, including merge-queue candidates. Failure artifacts contain screenshots and installation/parser/integration logs. After observing it pass on GitHub, require the `browser-integration` check alongside the other [CI gates](continuous-integration.md). The workflow's presence does not itself configure branch protection. Keep provider-specific testing tracked separately; this automated suite is not a claim that hosted provider flows were exercised.

The obsolete scripts under `scripts/` and the unused middleware story, patch, and parser smoke helpers have been removed. `projects/middleware/scripts/stack-smoke.mjs` remains the active launcher for the maintained E2E suite. Parser persistence and legacy migration checks remain in the normal parser/middleware test suites.
