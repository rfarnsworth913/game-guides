# Todoist project: Game Guides - LAN NAS Deployment

Scope: one production environment on the Synology NAS, LAN-only HTTPS, no staging or public ingress. Complete phases in order; gate tasks are manual exit checks, not automatic Todoist dependencies. No dates or assignees have been invented. The previously repaired tests are represented as inclusion and re-verification tasks.

Import `nas-deployment-todoist.csv` into a new Todoist project using the project menu: Import & export -> Import from CSV. Task descriptions contain acceptance details; gate tasks use priority 2 and other tasks use priority 4. All imported tasks are open verification/work items.

Source runbook: [NAS and CI deployment guide](nas-ci-deployment-guide-2026-11-14.md).
Todoist import format: [official CSV instructions](https://www.todoist.com/help/account-and-billing/security/import-or-export-a-project-as-a-csv-file-in-todoist-YC8YvN).

## 01 - Preserve work and record the NAS configuration

- [ ] Preserve all intended working-tree changes
  - Review and commit explicit paths or back them up outside the checkout. Do not stage .env.
- [ ] Back up the local environment configuration privately
  - Keep credentials outside Git and preserve the working configuration before switching old branches.
- [ ] Refresh and compare remote main and dev
  - Fetch origin; record heads, common ancestor and ahead/behind counts. Recheck the guide's historical snapshot.
- [ ] Create backup refs for main and dev
  - Use unique backup branch names without overwriting existing refs.
- [ ] Inventory the NAS and existing MongoDB deployment
  - Record DSM/Container Manager versions, CPU/memory/storage, MongoDB version/FCV/digest, data mounts and permissions.
- [ ] Rotate exposed credentials and check tracked secrets
  - Review the old tracked .env history without printing secrets. Update affected runtime credentials.
- [ ] Back up and test restoration of the full database and image library
  - Include account progress, schema backups, uploaded files and JSON sidecars. Keep a copy off the NAS; restore into an isolated disposable location.
- [ ] Gate: confirm preserved work and tested recovery
  - Proceed only after intended work, the live database/mount and a usable backup are verified.

## 02 - Establish passing tests and release checks

- [ ] Include the completed dashboard and browser-test repairs
  - The fixed fixture clock and updated dashboard selectors passed locally. Preserve these changes in the candidate branch.
- [ ] Align the Node and npm toolchain
  - Reconcile .node-version, packageManager, CI and local tooling; use the lockfile and npm ci.
- [ ] Run lint, all normal tests and the production UI build
  - Run npm run lint:ci, npm test and npm run ui:build. Record results and budget warnings.
- [ ] Run browser integration against disposable local or CI MongoDB
  - Set E2E_MONGODB_URI explicitly. Never give the destructive harness production credentials or point it at NAS production.
- [ ] Verify MongoDB driver and server compatibility
  - Review the pinned driver against the selected NAS MongoDB and Node versions. Test upgrades rather than downgrading the database to match old CI.
- [ ] Match CI database coverage to the production server major
  - Retain disposable MongoDB service containers and real JWT-validation tests. Keep test issuer injection inside the harness.
- [ ] Track lint warnings separately from blocking errors
  - Keep required checks failing on errors. Reduce the warning baseline in focused work before enforcing zero warnings.
- [ ] Gate: record passing candidate-commit checks
  - Require reproducible normal and browser passes on the actual candidate commit; previous local passes alone do not satisfy the release gate.

## 03 - Reconcile dev and main

- [ ] Create an isolated reconciliation worktree from origin/dev
  - Preserve local .env, ignored files and untracked work; do not switch directly to the stale local main.
- [ ] Merge origin/main into the reconciliation branch
  - Use an ordinary merge between related histories. Do not force-push or use unrelated-history reconciliation.
- [ ] Resolve conflicts and review removals deliberately
  - Preserve maintained behavior from both histories; reconcile package.json and regenerate the lockfile when necessary.
- [ ] Open and validate the reconciliation PR into dev
  - Run the required checks and review before merging. Keep .env untracked.
- [ ] Promote the reviewed dev tree to main through a PR
  - Use a merge commit and retain the long-lived dev branch.
- [ ] Back-merge main into dev and compare final trees
  - Resolve reverse-sync conflicts through review. Confirm intended content matches without requiring identical commit hashes.
- [ ] Gate: verify both histories and required checks are preserved
  - Do not proceed with release automation until reconciliation and reverse sync are green.

## 04 - Protect branches and automate reviewed merges

- [ ] Configure main and dev branch protection
  - Require PRs, required checks and resolved conversations. Prevent force pushes and branch deletion.
- [ ] Verify CodeRabbit review and merge enforcement
  - Confirm the app runs on a test PR and choose the actual status/review gate. Test a deliberately failing case.
- [ ] Define a workable maintainer approval policy
  - Require another maintainer's approval where available; avoid an impossible self-approval rule for a solo maintainer. Review sensitive changes manually.
- [ ] Add a required release-ready aggregate check
  - Depend on lint, tests, production build, browser/container checks and required security scans. Fail on failed, cancelled or unexpectedly skipped prerequisites.
- [ ] Keep untrusted PR checks on hosted runners
  - Use minimal permissions and no NAS credentials, production connection strings or LAN access.
- [ ] Configure a narrowly scoped release-automation GitHub App
  - Allow release PR management without branch-rule bypass. Ensure App-created PRs trigger the expected CI.
- [ ] Automate one dev-to-main release PR and gated auto-merge
  - Restrict automation to the intended repository and branches. Compare trees to avoid empty releases and reverse-sync loops; never use admin bypass.
- [ ] Gate: prove failed checks block automatic merging
  - Verify a green dev change creates one release PR and a failing change cannot reach main.

## 05 - Package and publish tested immutable images

- [ ] Add a production-safe Docker build context
  - Exclude .env, Git metadata, database files, private uploads, dependencies and temporary browser/test data.
- [ ] Build the production Angular web image and proxy
  - Provide SPA fallback and same-origin /api routing before index.html fallback. Use production assets rather than ng serve.
- [ ] Build a deployable middleware image
  - Package shared code and aliases correctly. Do not omit tsx as a dev dependency while still relying on it at runtime.
- [ ] Make API bind address and upload root configurable
  - Bind internally to 0.0.0.0 in containers and retain a persistent image/sidecar volume. Keep the API port private.
- [ ] Build a separate scheduled parser image
  - Include headless Chromium and libraries, writable temporary profiles, resource limits and bounded execution. Validate browser sandbox support on DSM.
- [ ] Build Linux AMD64 images with reviewed dependency pins
  - Use the selected Node/npm toolchain, lockfile, pinned base images and reviewed action versions.
- [ ] Test exact candidate images through the production proxy in CI
  - Use disposable services to verify health, deep links, auth, account isolation, completion persistence, conflicts and uploads.
- [ ] Scan dependencies, source, workflows, secrets and images
  - Review findings; document time-limited exceptions. Include build-time dependencies in the assessment.
- [ ] Publish tested main images and a verifiable release manifest
  - Record commit SHA, immutable image digests, SBOM/provenance and schema/migration compatibility. Do not deploy latest.
- [ ] Gate: confirm the published digests match the tested main release
  - No secrets, database dumps or test authentication bypass may be packaged.

## 06 - Prepare one production environment on the NAS

- [ ] Create restricted deployment, secrets, release, backup and log directories
  - Keep persistent production uploads and sidecars separate from replaceable images. No staging project or staging database is needed.
- [ ] Preserve the existing MongoDB container and data mount
  - Record its identity before changes. Never run two mongod processes against the same data directory or replace it with an empty mount.
- [ ] Configure the reviewed Container Manager Compose project
  - Verify the DSM Compose tooling and define production networks, volumes, limits, health checks and log rotation.
- [ ] Create least-privilege runtime database credentials
  - Separate application and parser users where practical; retain administrator credentials for maintenance and backup.
- [ ] Configure private container networking and outbound access
  - LAN proxy to web to API to MongoDB. API needs Auth0/JWKS egress; parser needs source-site egress. Do not publish backend ports.
- [ ] Use the MongoDB service alias and internal port for NAS containers
  - Use port 27017 on the private network. Restrict any retained host-published Compass port to trusted administrative devices.
- [ ] Migrate existing images and metadata sidecars into persistent storage
  - Confirm mounts do not hide required assets and releases cannot replace uploaded files.
- [ ] Set protected runtime environment files and container permissions
  - Keep secrets out of Git and images; use non-root app containers, limited writes, dropped capabilities and resource caps.
- [ ] Keep unattended parser writes disabled until critical fixes are verified
  - Resolve relevant cleanup/date/identity issues from the parser report; require locks, timeouts and accurate failure status.
- [ ] Gate: verify production state and recovery paths before startup
  - Confirm the intended database, uploads, credentials and backups. Validate restart persistence during the first maintenance deployment.

## 07 - Automate maintenance deployment and rollback

- [ ] Install a reviewed NAS pull-deployment task
  - Schedule through DSM with an exclusive lock and protected script ownership. Do not expose an inbound webhook or NAS runner to PR code.
- [ ] Validate release provenance and manifest contents
  - Require expected repository, workflow, main ref, commit and allowed image digests. Update only approved image references; never execute downloaded shell payloads.
- [ ] Pull and verify all images before touching live services
  - Keep the current release running if download, provenance or required CI evidence fails.
- [ ] Add approval holds for the first release and sensitive changes
  - Keep schema/auth/workflow releases manual until recovery behavior is demonstrated. Enable unattended routine releases only after successful deployments.
- [ ] Implement maintenance mode and a consistent pre-deploy backup
  - Block user writes, pause parser jobs, drain requests and stop API writers. Back up DB plus assets and record previous digests/schema before replacement.
- [ ] Replace the single production web/API release in place
  - Expect a short maintenance window. Account for migration-capable API startup; no staging or blue/green environment is available.
- [ ] Run controlled production health and smoke checks before reopening traffic
  - Use the real LAN origin and designated test accounts/records. Never run the destructive E2E harness against production.
- [ ] Implement schema-aware failure recovery
  - Keep maintenance active on failure. Restore previous images only if compatible; use deliberate DB/assets recovery when needed. Never automatically restore after user writes resume.
- [ ] Record deployment results and notify on failures
  - Retain current/previous digests and redacted logs; reopen LAN access and resume approved jobs only after successful checks.
- [ ] Gate: demonstrate a successful release and a recoverable failure
  - Prove verification failure leaves production unchanged and a failed live release follows the recovery procedure.

## 08 - Configure LAN-only DNS, HTTPS and Auth0

- [ ] Reserve the NAS address and choose the production LAN hostname
  - Use one stable origin and allowed LAN subnet list. No staging hostname or publicly reachable application is required.
- [ ] Configure local DNS for the website hostname
  - Resolve the chosen hostname to the reserved NAS address. Do not publish an application A/AAAA record for internet access.
- [ ] Install and renew a certificate trusted by every client
  - Use an owned-domain certificate with DNS validation or a correctly trusted internal CA. Verify hostname and Auth0 compatibility; do not bypass browser TLS errors.
- [ ] Configure the LAN HTTPS reverse proxy and firewall
  - Route the exact hostname to web and allow only intended LAN subnets. Review IPv6 and guest VLAN access.
- [ ] Disable public ingress paths for this application
  - No router forwarding, UPnP mapping, public tunnel or alternate direct-origin route.
- [ ] Set exact Auth0 callback, logout and web-origin URLs
  - Use the final HTTPS LAN origin; set APP_ORIGIN to the same origin. Preserve issuer/audience/account mapping and avoid broad wildcards.
- [ ] Verify real Google/Auth0 login from LAN devices
  - Check refresh, new tabs, logout and access denial. Browsers and NAS still need outbound internet for authentication and service dependencies.
- [ ] Migrate guest progress to the new browser origin if needed
  - Export/import local guest data; account progress remains in MongoDB. Local filters and reading positions do not transfer automatically.
- [ ] Gate: confirm LAN access works and off-network access fails
  - Verify trusted HTTPS, deep links, login, uploads and persistence on LAN; confirm unreachability using mobile data and firewall inspection.

## 09 - Verify runtime security and recovery

- [ ] Patch DSM and restrict NAS administration
  - Enable administrator MFA, review permissions and restrict DSM/SSH to trusted administrative access.
- [ ] Test API authorization and account isolation
  - Reject wrong, expired or invalid tokens; enforce editor permissions on the server.
- [ ] Correct proxy-aware rate limiting and request bounds
  - Trust client IP only through the controlled proxy path. Prevent shared-proxy quota problems, spoofed headers and unbounded requests/uploads.
- [ ] Enforce appropriate security headers and private-response caching rules
  - Test CSP before enforcement; configure frame/referrer/permissions protections and no-store for private APIs. Cache static assets separately.
- [ ] Review markdown, links and token handling for XSS risk
  - Verify sanitization, safe DOM behavior, dependency patches and CSP. Logout does not revoke every issued bearer token.
- [ ] Validate upload handling and anonymous data exposure
  - Check MIME/content/path/size/authorization and serving headers. Keep debug files, backups, secrets and private records out of public-facing catalog responses.
- [ ] Verify off-NAS backups, monitoring and restore ownership
  - Alert on failed backups/deploys/parsers, stale data, API errors and storage pressure. Keep logs rotated and secrets redacted.
- [ ] Gate: sign off the LAN security and recovery checklist
  - Use destructive security tests only in disposable CI services; keep live verification controlled and non-destructive.

## 10 - Launch and operate the LAN site

- [ ] Approve and schedule the first production maintenance deployment
  - Confirm exact release digests, required checks, backups and rollback instructions before starting.
- [ ] Verify the first live release before opening general LAN access
  - Check catalog IDs/counts, account progress, editor writes, conflicts, images, deep links, auth and refresh persistence.
- [ ] Confirm restart persistence and observe NAS resource use
  - Ensure images and database state survive restarts; review logs and health after reopening traffic.
- [ ] Enable reviewed parser jobs one at a time
  - Use non-overlap locks, timeouts, failure/freshness alerts and correct game-server timezone behavior.
- [ ] Enable automatic deployment for eligible routine releases
  - Require exact main-commit CI and provenance. Retain explicit holds for migrations and security-sensitive changes.
- [ ] Document the operational and recovery owner
  - Record backup/restore steps, rollback compatibility, certificate renewal, credential rotation and incident notifications without storing secrets in tasks.
- [ ] Gate: close the LAN deployment project
  - Confirm aligned branches, enforced CI/review, verified NAS pull deployment, one persistent production environment, LAN-only HTTPS and working recovery.
