# Application deployment roadmap

Prepared November 24, 2026, from the current checkout. This is an implementation and release plan, not a record of completed deployment work.

Deliverables: this guide and [the Todoist import CSV](deployment-roadmap-todoist-2026-11-24.csv). The numbered tasks below and the CSV are the same checklist. This roadmap replaces the earlier NAS/parser task lists, which have been removed to avoid conflicting instructions. Use the [documentation index](README.md) for maintained feature and operations guides.

## Recommended rollout

1. Establish the source and recovery baseline.
2. Implement server-enforced publication permissions, navigation, feedback and release identity.
3. Require complete CI and review; promote dev into protected main automatically.
4. Package immutable app/parser images and deploy privately to the NAS.
5. Schedule parsers and obtain private friend review.
6. Move the database to a managed provider while the NAS application still works.
7. Deploy the tested app image to external hosting, then publish after the go-live gate.
8. Monitor, promote and document the work for your portfolio.

The NAS remains LAN/VPN-only throughout. Public internet access belongs to the later external-hosting phase, not port forwarding to the NAS. No persistent staging environment is required: use disposable CI databases and test containers, then one active production deployment. Backups and isolated restore targets are still required.

MongoDB Atlas plus a Render Docker web service and compatible object storage are proposed choices, not already selected or provisioned services. P00-04 confirms budget, region and capabilities before spending money. Other providers can replace them if they satisfy the same gates.

## Current baseline and gaps

| Area | Observed in this checkout | Work still needed |
| --- | --- | --- |
| Branches | dev is checked out; local main, master and ai branches exist; working tree contains unfinished changes | Preserve work, fetch remote state and establish one production branch; do not reuse historical ahead/behind counts |
| CI | ci.yml runs lint, npm test and UI build; browser-integration.yml separately runs parser browser fixtures and UI E2E with disposable MongoDB | Confirm actual GitHub branch rules, aggregate all mandatory results and prove candidate/merge SHA handling |
| Review | CodeRabbit configuration exists | Verify the installed integration and enforce an achievable review policy |
| Toolchain | .node-version is 26.13.0; packageManager declares npm 10.8.2 | Reproduce this deliberately across CI and images; future upgrades require checks |
| Runtime | npm start is a developer launcher; API binds to 127.0.0.1 | Add production serving/startup, configurable container host/port and health checks |
| Containers | Parser Dockerfile exists; no production app deployment bundle was found | Build the application image and versioned deployment scripts/configuration |
| Uploaded media | API image storage points into projects/guides-app/src/assets | Move to persistent storage and provide durable cloud storage without breaking URLs or access controls |
| Game permissions | Feature selection and archived state exist; neither is a publication/read-access policy | Add inherited game/content visibility and enforce it in middleware, references and media |
| Parsers | Eight profiles, preview/weekly commands, two-month horizon and reports already exist | Operationalize one scheduler, alerting, durable reports, locks and source-gap handling |
| Changelog | CHANGLOG.md exists and contains a future-dated entry | Preserve history, fix naming/dating, and add reviewed in-app release notes |

Application build/test suites were not run for this documentation change. The CSV was parsed back and checked for row structure, task/section counts, unique IDs, priorities and dependency references. Previous passing application results are useful context, but every release must collect fresh evidence for its own SHA. GitHub settings, NAS configuration and provider accounts have not been changed by creating this plan.

## Target delivery architecture

```text
Feature/AI work -> dev -> complete CI + review -> protected promotion PR -> main
                                                                   |
                                              complete merged-main checks
                                                                   |
                                         build + scan + smoke-test images
                                                                   |
                                             approved SHA + image digests
                                                     /             \
                              NAS pulls release manifest          Cloud deploy API
                              private HTTPS app + API              public HTTPS app + API
                                      |                                  |
                              local MongoDB initially ---> managed MongoDB
                                      |
                       separate scheduled parser image; one active scheduler

Uploaded media: durable NAS volume first -> authorized cloud object storage
Recovery: consistent DB backup + uploaded media/metadata + release/config manifest
```

The application image should serve the Angular build and API at one origin. This reduces cross-origin configuration and makes the same artifact usable on the NAS and a Docker web host. This requires new production-serving code; the existing launcher is not a production server. Keep the browser-heavy parser in a separate image.

Use merge commits for repeated long-lived dev-to-main promotion, and reconcile production hotfixes back to dev. Auto-merge must wait for branch requirements; a failed, cancelled, skipped or stale check cannot count as green. GitHub feature availability depends on repository visibility and plan. See [GitHub auto-merge](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request).

Automation identity matters: current GitHub documentation describes approval-required PR runs and suppressed push workflows for some GITHUB_TOKEN actions. Test the complete event chain; use a narrowly scoped GitHub App when needed for unattended promotion and verify merged-main checks actually execute. See [workflow-trigger behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

## Import into Todoist

1. Download or locate deployment-roadmap-todoist-2026-11-24.csv from this folder.
2. Create an empty Todoist project called Game Guides - Deployment Roadmap.
3. Open the project's three-dot menu, then Import & export -> Import from CSV.
4. Select the CSV and verify the section/task counts listed below, priorities and task descriptions.
5. Assign owners and dates after reviewing the sequence. Do not import the same file repeatedly into the same project; it can create duplicates.

The file uses UTF-8, the documented Todoist columns, lowercase task/section row types and explicit priorities: 1 is highest and 4 lowest. Dates, deadlines, assignees and durations are intentionally blank. Stable IDs such as P06-05 and the After text describe dependencies; CSV import does not implement dependency enforcement. All tasks are pending, including verification of capabilities that already exist. Follow [Todoist's CSV import instructions](https://www.todoist.com/help/account-and-billing/security/import-or-export-a-project-as-a-csv-file-in-todoist-YC8YvN).

## How to execute the checklist

The default dependency is the preceding task. P01 and P03 can begin independently after P00; the permissions and CI work can proceed in parallel when practical. Gates collect evidence before the next release stage, not merely a checked box. Save test links, release SHA/digests, restore results and reviewer findings in each gate's Todoist description/comment.

P11's public-launch gate requires every earlier gate, including permissions and feedback work that is not directly required to build an image. Auto-merge can be enabled before unattended deployment: initially approve first installs and data-changing migrations explicitly, then automate compatible routine releases after rehearsals pass.

Checklist totals: **120 tasks in 13 sections**.

| Phase | Tasks | Milestone |
| --- | --- | --- |
| 00 - Establish the release baseline | 8 | the source, production branch, recovery copies and target architecture are agreed. |
| 01 - Permissioned games, content and navigation | 9 | restricted content cannot be read through the UI, API, search or media URLs. |
| 02 - Changelog, feedback and release identity | 8 | reviewers can identify the deployed version and submit actionable private feedback. |
| 03 - Build pipeline, tests and security gates | 10 | a single trustworthy result describes all required checks for the exact candidate SHA. |
| 04 - Automatic dev-to-main promotion | 8 | dev is merged automatically through a protected PR only after all required checks pass. |
| 05 - Production packaging and persistent storage | 12 | the tested app and parser images run without the checkout or developer machine. |
| 06 - Private NAS production deployment | 10 | one private NAS production deployment can safely update and roll back a tested release. |
| 07 - Scheduled parser operations | 10 | scheduled imports are repeatable, observable and preserve existing user and shared data. |
| 08 - Private friend review and release candidate | 8 | normal users validate the real deployment and release-blocking feedback is resolved. |
| 09 - Managed database migration | 10 | the private NAS application and parser use a backed-up managed database without lost data. |
| 10 - Public hosting and automated deployment | 10 | a tested release is deployed to the public host with durable data and controlled promotion. |
| 11 - Public go-live readiness and operations | 9 | the application is safe to publish, supportable and recoverable. |
| 12 - Launch, promotion and portfolio | 8 | the public launch is verified and the portfolio describes evidence-backed work. |

## Implementation checklist

### 00 - Establish the release baseline

Exit gate: the source, production branch, recovery copies and target architecture are agreed.

- [ ] **P00-01 - Preserve current work and take recovery copies**
  - After: Start here. Priority: p1. Done when: Review the dirty working tree, commit intended code explicitly, and privately back up environment files, the current database, uploaded files and image metadata. Never commit secrets or discard unrelated changes.
- [ ] **P00-02 - Inventory the existing installation**
  - After: P00-01. Priority: p2. Done when: Record DSM and Container Manager versions, NAS CPU/RAM/free disk, MongoDB image/version and volume paths, database/collection names, Auth0 tenant, DNS, backup destinations and current users. Record where the app actually runs today.
- [ ] **P00-03 - Reconcile dev, main and master once**
  - After: P00-02. Priority: p1. Done when: Fetch remote refs, inspect history and actual deployed SHA, and choose main as the single production branch unless existing deployment requires a documented alternative. Merge reviewed work without resetting histories; retire master only after updating every consumer.
- [ ] **P00-04 - Choose providers and a monthly spending limit**
  - After: P00-03. Priority: p2. Done when: Evaluate MongoDB Atlas, Render Docker hosting and compatible object storage as the proposed cloud stack. Confirm region, backups, outbound networking, cron/browser support, account ownership and monthly cost before provisioning paid services.
- [ ] **P00-05 - Define production access and publication policy**
  - After: P00-04. Priority: p1. Done when: NAS stays LAN/VPN-only. Friends initially use private access; public access begins only at the cloud launch gate. Define guest, account and editor permissions, which games/content may be published, and who can approve publication.
- [ ] **P00-06 - Set launch scope and recovery targets**
  - After: P00-05. Priority: p2. Done when: Choose ready games/features, supported browsers, expected initial users, proposed RPO of 24 hours and RTO of 2 hours, and an acceptable maintenance window. Adjust these targets explicitly to match backup cost and restore evidence.
- [ ] **P00-07 - Record the release architecture and environment contract**
  - After: P00-06. Priority: p2. Done when: Agree on one same-origin Angular-plus-API application image, a separate parser image, persistent media, secret storage and one active parser scheduler. Record NAS/public origins and required variables without values containing secrets.
- [ ] **P00-08 - GATE - approve the baseline and rollout sequence**
  - After: P00-07. Priority: p1. Done when: Confirm recovery copies are usable, production branch is unambiguous, provider/budget decisions have owners, and phases use one production environment at a time plus disposable CI services.

### 01 - Permissioned games, content and navigation

Exit gate: restricted content cannot be read through the UI, API, search or media URLs.

- [ ] **P01-01 - Design visibility fields and inheritance**
  - After: P00-08. Priority: p2. Done when: Add public/editors visibility to game and supported shared-content contracts. Effective visibility must honor every parent; feature flags and archived state remain separate. Newly created content defaults to editors until explicitly published.
- [ ] **P01-02 - Back up and migrate existing visibility safely**
  - After: P01-01. Priority: p1. Done when: Inventory existing visibility expectations, back up affected collections, migrate idempotently and preserve IDs, references and account completion. Review existing public items before retaining their public status; do not silently delete data.
- [ ] **P01-03 - Enforce visibility in middleware reads and writes**
  - After: P01-02. Priority: p1. Done when: Apply authorization before serialization to lists, individual records, game documents, events, character/story references and protected writes. Return consistent denied/not-found behavior without leaking hidden names or counts.
- [ ] **P01-04 - Protect search, relationships and image access**
  - After: P01-03. Priority: p1. Done when: Apply the same policy to search suggestions, linked requirements, media, thumbnails, bulk responses and downloads. Restricted objects must not remain accessible from public object-storage URLs or a static assets directory.
- [ ] **P01-05 - Add editor publication controls**
  - After: P01-04. Priority: p2. Done when: Add visible editor-only controls for game/content visibility and show effective inherited restrictions. Explain why a child cannot be public beneath a restricted parent; record publication changes in an audit trail.
- [ ] **P01-06 - Improve switching and navigation between games**
  - After: P01-05. Priority: p2. Done when: Show only authorized games and enabled features in the expanded game switcher. Preserve useful per-game context, favorites and recent selections; support keyboard search and provide a valid fallback when the current game becomes inaccessible.
- [ ] **P01-07 - Handle denied deep links and account changes**
  - After: P01-06. Priority: p1. Done when: Recheck access for direct URLs, hashes, sign-in/out and editor-role changes. Clear or partition user-dependent caches so a previous editor's hidden content cannot appear for a guest on the same browser.
- [ ] **P01-08 - Add permission and navigation regression coverage**
  - After: P01-07. Priority: p1. Done when: Test guest/account/editor access across API endpoints and media, crafted IDs, hidden parent/public child combinations, reference resolution, game switching and two accounts. Existing user progress must survive becoming temporarily inaccessible.
- [ ] **P01-09 - GATE - approve permissioned browsing**
  - After: P01-08. Priority: p1. Done when: Demonstrate that an editor sees a restricted game/content while a normal friend and guest cannot retrieve it directly or indirectly. Verify the allowed game's enabled navigation and completion still work.

### 02 - Changelog, feedback and release identity

Exit gate: reviewers can identify the deployed version and submit actionable private feedback.

- [ ] **P02-01 - Establish one canonical changelog**
  - After: P01-09. Priority: p2. Done when: Preserve CHANGLOG.md history while correcting the filename to CHANGELOG.md and updating references. Verify the future-dated 2026-11-26 entry; place unreleased changes under Unreleased rather than inventing a release date.
- [ ] **P02-02 - Expose a safe application version**
  - After: P02-01. Priority: p2. Done when: Display release version and short commit SHA in About/settings and feedback context. Generate these from the tested build; do not expose environment variables or deployment credentials.
- [ ] **P02-03 - Add the in-app changelog**
  - After: P02-02. Priority: p2. Done when: Show reviewed user-facing release notes with dates and feature summaries. Keep internal-only games, hidden content and security-sensitive details out of public notes; link notes to the release SHA.
- [ ] **P02-04 - Implement a feedback intake and editor inbox**
  - After: P02-03. Priority: p2. Done when: Add bug, usability and feature-request categories, optional contact, route/game context and version. Keep submissions private, validate lengths, rate-limit intake and authorize inbox access on the server.
- [ ] **P02-05 - Add consent and safe diagnostics**
  - After: P02-04. Priority: p1. Done when: Let users review diagnostics and explicitly opt into screenshots/contact information. Never attach access tokens, refresh tokens, cookies, database URLs or unrelated account data. Define retention and deletion behavior.
- [ ] **P02-06 - Support feedback triage and resolution**
  - After: P02-05. Priority: p2. Done when: Track new, accepted, in-progress and resolved feedback with severity, reproduction steps and a link to the eventual fix/release. Choose an owner and avoid duplicating private submissions into public issues automatically.
- [ ] **P02-07 - Test feedback and release-note access**
  - After: P02-06. Priority: p2. Done when: Verify logged-out and signed-in flows, denied inbox access, malformed/spam submissions, safe error states and keyboard/mobile behavior. Confirm a failed submission preserves the user's text.
- [ ] **P02-08 - GATE - approve the reviewer support loop**
  - After: P02-07. Priority: p1. Done when: A normal reviewer can find the running version, submit a private report and receive a clear acknowledgement; an editor can triage it and document its resolution.

### 03 - Build pipeline, tests and security gates

Exit gate: a single trustworthy result describes all required checks for the exact candidate SHA.

- [ ] **P03-01 - Audit the two current CI workflows**
  - After: P00-08. Priority: p2. Done when: Review ci.yml, browser-integration.yml and CodeRabbit configuration. Record actual required check names, branch rules, permissions and timeouts; distinguish configuration present in Git from settings actually enabled on GitHub.
- [ ] **P03-02 - Pin a consistent toolchain**
  - After: P03-01. Priority: p2. Done when: Use .node-version and a deliberate npm version across developer, CI and image builds. Pin reviewed action versions/SHAs and container bases; reconcile current checkout/setup-node v4 versus v6 usage without blind major upgrades.
- [ ] **P03-03 - Run all existing quality commands on clean installs**
  - After: P03-02. Priority: p1. Done when: Require npm ci, npm run lint:ci, npm test and npm run ui:build. Fix errors and deliberately ratchet warnings; keep broad formatting cleanup separate. Save commands and results against the candidate SHA.
- [ ] **P03-04 - Keep browser integration a required check**
  - After: P03-03. Priority: p1. Done when: Run npm run parser:browser-test and npm run ui:e2e on Ubuntu with disposable MongoDB and installed Playwright libraries. Verify auth, account isolation, persistence, concurrent updates, uploads, logout and cleanup; no production DB or Auth0 bypass.
- [ ] **P03-05 - Expand deployment-related regression coverage**
  - After: P03-04. Priority: p2. Done when: Add visibility, enabled-feature navigation, private images, changelog/feedback and direct-link cases. Validate auth and refresh recovery without weakening production JWT verification. Add readiness and deployed-image smoke checks when packaging exists.
- [ ] **P03-06 - Add dependency, secret and container scanning**
  - After: P03-05. Priority: p1. Done when: Scan commits/dependencies and later built images; set an explicit policy for actionable high/critical issues with time-limited documented exceptions. Add an update bot and lockfile review. Ensure scanner failures cannot silently pass.
- [ ] **P03-07 - Make code review enforceable and practical**
  - After: P03-06. Priority: p2. Done when: Confirm CodeRabbit runs on relevant PRs, resolve actionable findings, and choose supported blocking checks or an explicit release-review policy. Do not require an unavailable second human for every solo-authored PR or assume comments equal approval.
- [ ] **P03-08 - Create an aggregate release-readiness check**
  - After: P03-07. Priority: p1. Done when: One stable required check must fail when lint, tests, build, browser integration or mandatory security/review checks fail, cancel or skip. It must evaluate the same candidate commit, not the last successful run on a branch.
- [ ] **P03-09 - Harden workflow credentials and artifacts**
  - After: P03-08. Priority: p1. Done when: Untrusted PRs receive no deployment secrets and never execute on the NAS. Use least-privilege workflow tokens, safe checkout, bounded artifact retention and redacted failure diagnostics; do not execute PR code through privileged pull_request_target jobs.
- [ ] **P03-10 - GATE - demonstrate passing and failing candidates**
  - After: P03-09. Priority: p1. Done when: Show a complete green candidate and intentionally failing/cancelled checks that block promotion. Verify a subsequent push invalidates old success, and document the exact required checks and measured runtime.

### 04 - Automatic dev-to-main promotion

Exit gate: dev is merged automatically through a protected PR only after all required checks pass.

- [ ] **P04-01 - Configure production branch protections**
  - After: P03-10. Priority: p1. Done when: Protect main against force pushes, deletion and direct writes; require current checks and an up-to-date merge candidate. Verify GitHub plan support for these protections and auto-merge. AI-authored changes use the same policy.
- [ ] **P04-02 - Choose a promotion merge strategy**
  - After: P04-01. Priority: p2. Done when: Use merge commits for recurring dev-to-main promotion so long-lived branch ancestry stays coherent. Short-lived feature branches may use squash. Document conflict resolution and how any main hotfix returns to dev.
- [ ] **P04-03 - Create or update one dev-to-main promotion PR**
  - After: P04-02. Priority: p2. Done when: After dev's aggregate check succeeds, automation updates one same-repository PR with head dev and base main. Include changelog/test evidence and deduplicate retries; revalidate the current SHA before taking action.
- [ ] **P04-04 - Configure a scoped automation identity**
  - After: P04-03. Priority: p1. Done when: Use a minimally privileged GitHub App where needed for unattended PR/check/merge events. Verify the actual event chain: GITHUB_TOKEN-created PR checks can require approval and token-driven pushes may not start later workflows. Avoid a broad personal token.
- [ ] **P04-05 - Enable protected auto-merge**
  - After: P04-04. Priority: p1. Done when: Enable auto-merge for the approved promotion PR; allow required checks and review policy to decide readiness. Never use administrator bypass or force a merge after only unit tests pass. New pushes must rerun checks.
- [ ] **P04-06 - Verify the merged main commit before publishing**
  - After: P04-05. Priority: p1. Done when: Run the complete required suite for the resulting main commit, then authorize artifact publication for that SHA. Prove the chosen merge identity triggers the main workflow; otherwise dispatch and verify it explicitly.
- [ ] **P04-07 - Handle conflicts, stale results and emergency holds**
  - After: P04-06. Priority: p2. Done when: Notify on conflicts, failed review, cancelled runs and protected-branch failures. Add a release hold/kill switch; do not auto-resolve conflicts or promote an old green SHA after dev advances.
- [ ] **P04-08 - GATE - rehearse two promotions and a blocked merge**
  - After: P04-07. Priority: p1. Done when: Demonstrate two successive dev-to-main merges, an intentionally failing PR, a new-commit rerun and a main hotfix reconciliation. Confirm unrelated branches/forks cannot trigger promotion.

### 05 - Production packaging and persistent storage

Exit gate: the tested app and parser images run without the checkout or developer machine.

- [ ] **P05-01 - Add an explicit production runtime**
  - After: P04-08. Priority: p2. Done when: Create a production start command without ng serve, --watch or the local database launcher. Bundle/compile the API with working @lib/@common resolution and runtime dependencies; do not assume tsc rewrites import aliases.
- [ ] **P05-02 - Make the application host and port configurable**
  - After: P05-01. Priority: p2. Done when: Replace the hard-coded API bind to 127.0.0.1 with configuration: keep a safe local-development default and bind 0.0.0.0 inside the production container. Honor the cloud PORT contract while keeping database ports private.
- [ ] **P05-03 - Serve the Angular build and API from one origin**
  - After: P05-02. Priority: p2. Done when: Add production static serving with safe paths, correct MIME/cache headers and SPA deep-link fallback. API 404s must remain JSON rather than index.html; protected uploads must never be exposed through static fallback.
- [ ] **P05-04 - Externalize public Auth0 and origin configuration**
  - After: P05-03. Priority: p2. Done when: Support NAS and cloud origins without embedding environment-specific values in the immutable image. Provide only non-secret SPA configuration; preserve server issuer/audience/client validation and exact allowed origins.
- [ ] **P05-05 - Move uploaded media out of the source tree**
  - After: P05-04. Priority: p1. Done when: Replace the current source-assets imageRoot with configurable persistent storage. Migrate files and JSON metadata with checksums, retain existing /api/games/.../images URLs and support bundled legacy assets during migration.
- [ ] **P05-06 - Add a storage adapter suitable for cloud hosting**
  - After: P05-05. Priority: p2. Done when: Provide an object-storage implementation or equivalent durable cloud storage. Preserve metadata, attribution, authorization and deletion rules; restricted media stays private with authorized delivery. Test lost-upload/retry and restore behavior.
- [ ] **P05-07 - Build a minimal non-root application image**
  - After: P05-06. Priority: p2. Done when: Add a multi-stage Dockerfile and .dockerignore excluding .env, Git, databases, uploads, tmp and credentials. Include only required runtime dependencies, graceful shutdown and health checks; verify amd64 on the DS1522+.
- [ ] **P05-08 - Harden and test the existing parser image**
  - After: P05-07. Priority: p2. Done when: Keep its supported headed-under-Xvfb behavior and browser dependencies until parity is proven. Separate parser credentials, persistent reports/locks and execution limits; test container permissions, termination and dry-run mode.
- [ ] **P05-09 - Create readiness, liveness and migration contracts**
  - After: P05-08. Priority: p2. Done when: Add safe liveness and dependency-aware readiness without credential leaks. Migrations must be backed up, idempotent and serialized; one elected migration runner must protect multi-instance/cloud startup.
- [ ] **P05-10 - Publish verified immutable images**
  - After: P05-09. Priority: p1. Done when: After merged-main checks pass, build app/parser images once, scan them, record SBOM/provenance and publish commit tags plus digests. Smoke-test those exact images with disposable services before updating a deployable release manifest.
- [ ] **P05-11 - Add a versioned production deployment bundle**
  - After: P05-10. Priority: p2. Done when: Check in Compose/runtime templates, example non-secret configuration, a release manifest and deployment/rollback scripts. Record image digests and supported schema versions; provide first-install and upgrade instructions.
- [ ] **P05-12 - GATE - rehearse install, restart, upgrade and restore**
  - After: P05-11. Priority: p1. Done when: In a disposable environment, prove deep links, Auth0 configuration, private images, uploads, migrations, SIGTERM and data persistence across container replacement. App and parser must run without the working tree.

### 06 - Private NAS production deployment

Exit gate: one private NAS production deployment can safely update and roll back a tested release.

- [ ] **P06-01 - Prepare NAS folders and service permissions**
  - After: P05-12. Priority: p2. Done when: Create separate restricted directories for configuration, media, database, reports, logs, release manifests and backups. Record numeric ownership, quota/free-space checks and an off-NAS encrypted backup destination.
- [ ] **P06-02 - Configure private container networking**
  - After: P06-01. Priority: p1. Done when: Use a bridge network with internal service names. Expose only the application through the NAS reverse proxy; do not publish MongoDB, the API administration surface or DSM to the internet. Verify actual firewall rules.
- [ ] **P06-03 - Set up a stable HTTPS NAS application address**
  - After: P06-02. Priority: p1. Done when: Configure LAN/VPN DNS, reverse proxy and trusted TLS. Choose an internal CA installed on reviewer devices or a valid domain/certificate approach without opening NAS inbound internet access. Never disable HTTPS/auth validation to make login work.
- [ ] **P06-04 - Configure production Auth0 and database credentials**
  - After: P06-03. Priority: p1. Done when: Register exact NAS callback/logout/web origins, verify refresh behavior and preserve existing issuer/sub account identity. Use separate least-privilege app/parser DB users and keep secrets outside Git/images.
- [ ] **P06-05 - Back up and deploy the first tested release**
  - After: P06-04. Priority: p1. Done when: Capture consistent DB plus media/metadata backups, restore-test them, install the versioned bundle and pull the approved digests. Verify migrations, readiness, guest operation and editor access before enabling normal writes.
- [ ] **P06-06 - Implement a NAS-initiated deployment job**
  - After: P06-05. Priority: p2. Done when: DSM Task Scheduler or an equivalent local service polls a trusted release manifest, verifies approved SHA/digests, takes an exclusive deploy lock, pulls images and runs health checks. Hosted CI never needs inbound SSH access to the LAN.
- [ ] **P06-07 - Add safe deployment controls and rollback**
  - After: P06-06. Priority: p1. Done when: Provide deploy-latest-tested, deploy-specific-release and rollback commands. Retain previous images/config; on failed app health restore the compatible previous image, not an automatic destructive DB restore. Record deployment logs and status.
- [ ] **P06-08 - Protect first releases and schema changes**
  - After: P06-07. Priority: p2. Done when: Allow main merges automatically, but require an explicit promotion approval for the first NAS release and migrations with data impact. Enable unattended routine deployments only after rollback and compatibility evidence are recorded.
- [ ] **P06-09 - Exercise restart, outage and backup recovery**
  - After: P06-08. Priority: p2. Done when: Reboot NAS/containers, simulate DB outage and failed image start, and verify graceful recovery. Restore DB and uploaded media together to an isolated target and compare counts/checksums against RPO/RTO.
- [ ] **P06-10 - GATE - approve private NAS production**
  - After: P06-09. Priority: p1. Done when: Confirm a real LAN client can log in, navigate, edit, upload and persist progress, and an unauthorized network cannot reach the service. A failed release must leave a usable previous deployment.

### 07 - Scheduled parser operations

Exit gate: scheduled imports are repeatable, observable and preserve existing user and shared data.

- [ ] **P07-01 - Review the supported parser profiles**
  - After: P06-10. Priority: p2. Done when: Confirm the current eight profiles: Endfield, Genshin, HSR, Wuthering Waves, ZZZ, Fate/Grand Order, Girls Frontline 2 and Neverness to Everness. Exclude FFXIV deliberately; do not reuse obsolete unsupported-game checklists.
- [ ] **P07-02 - Document parser inputs, time rules and expected outputs**
  - After: P07-01. Priority: p2. Done when: Record current-version sources, dynamic-event sources and recurring daily/weekly/monthly/endgame definitions per game. Verify next-two-month coverage, local calendar-day handling and server reset rules with fixed-clock fixtures.
- [ ] **P07-03 - Run a containerized preview against protected credentials**
  - After: P07-02. Priority: p1. Done when: Execute parser:preview with --report and per-game filters as needed. Inspect proposed changes without writes, source failures and data-loss risks; verify existing permanent/dynamic history and completion IDs are preserved.
- [ ] **P07-04 - Establish one active scheduler and lock**
  - After: P07-03. Priority: p1. Done when: Use a persistent lock for NAS execution and prevent overlapping manual/scheduled jobs. Before any cross-host scheduling, add a durable shared lease or disable the other scheduler; filesystem locks do not coordinate separate hosts.
- [ ] **P07-05 - Create the Monday NAS scheduled task**
  - After: P07-04. Priority: p2. Done when: Use DSM Task Scheduler at Monday 06:00 America/New_York, equivalent to 0 6 * * 1 in that scheduler timezone. Run the pinned parser image's parser:weekly command with --months=2 and a unique report path; verify DST behavior.
- [ ] **P07-06 - Set runtime, source pacing and failure policy**
  - After: P07-05. Priority: p1. Done when: Preserve the existing 10-30 second navigation pacing and 10-second parse wait where needed. Bound total runtime/retries; report Cloudflare blocks and partial source failures distinctly. Never treat a blocked source as an empty dataset to delete.
- [ ] **P07-07 - Monitor reports and send failure alerts**
  - After: P07-06. Priority: p2. Done when: Persist timestamped reports, latest summary, exit status, run duration, source freshness and counts of inserted/updated/skipped records. Notify the operator on partial/failed/missed runs; redact URLs containing credentials.
- [ ] **P07-08 - Test replay, manual recovery and parser rollback**
  - After: P07-07. Priority: p1. Done when: Run one approved live import after a backup, repeat it to prove idempotency, interrupt a run to verify lock recovery and test per-game retry. Retain valid partial results; historical events and player completion remain intact.
- [ ] **P07-09 - Verify coverage in the actual events UI**
  - After: P07-08. Priority: p2. Done when: Check Today/List/Calendar, type filters, Balance events and month boundaries for all eight games. Confirm daily tasks appear on intended days, reset cycles remain separate and expiring events sort correctly.
- [ ] **P07-10 - GATE - approve unattended parser scheduling**
  - After: P07-09. Priority: p1. Done when: Record one successful scheduled run plus a controlled failure/alert and safe retry. Confirm the next Monday run, two-month horizon, backups and sole active writer before leaving automation enabled.

### 08 - Private friend review and release candidate

Exit gate: normal users validate the real deployment and release-blocking feedback is resolved.

- [ ] **P08-01 - Set up private reviewer connectivity**
  - After: P07-10. Priority: p1. Done when: Use a limited VPN/device-sharing arrangement such as Tailscale, or trusted LAN access. Grant only the application service; deny DSM, SSH, MongoDB and unrelated NAS shares. Verify HTTPS and the selected Auth0 origin on a friend's device.
- [ ] **P08-02 - Create a reviewer onboarding checklist**
  - After: P08-01. Priority: p2. Done when: Explain sign-in, private-beta scope, test games, known limitations, feedback location and how to revoke access. Use individual accounts; friends are ordinary users unless editor access is explicitly required.
- [ ] **P08-03 - Prepare safe review data and permissions**
  - After: P08-02. Priority: p2. Done when: Keep private/unreleased games editor-only, separate test progress per account and avoid sharing your credentials. Review media and personal information before granting access; document whether beta data will carry into public launch.
- [ ] **P08-04 - Run the friend acceptance script**
  - After: P08-03. Priority: p2. Done when: Ask reviewers to switch games, follow story deep links, track completion across refresh/tabs, manage characters/inventory, filter/balance events, upload only when authorized and sign out. Include mobile and keyboard use.
- [ ] **P08-05 - Validate account isolation and editor boundaries**
  - After: P08-04. Priority: p1. Done when: Verify one reviewer cannot read another account's progress or perform editor actions. Test direct requests and restricted content/media access as well as hidden UI controls.
- [ ] **P08-06 - Collect, prioritize and fix beta findings**
  - After: P08-05. Priority: p2. Done when: Triage reports using deployed version, severity and reproduction steps. Resolve data loss, access leaks, login failures and incorrect completion first; publish known nonblocking issues and retest fixes on the NAS.
- [ ] **P08-07 - Measure the deployment under realistic usage**
  - After: P08-06. Priority: p2. Done when: Check initial/deep-link loads, event-list rendering, memory, API latency, concurrency, storage growth and parser impact. Set practical launch thresholds from evidence instead of invented capacity claims.
- [ ] **P08-08 - GATE - sign off the cloud release candidate**
  - After: P08-07. Priority: p1. Done when: Have at least one friend complete the acceptance flow, confirm blockers are closed, prove access revocation and record the tested release digest. Private-beta signoff does not automatically publish the NAS.

### 09 - Managed database migration

Exit gate: the private NAS application and parser use a backed-up managed database without lost data.

- [ ] **P09-01 - Provision the chosen managed MongoDB service**
  - After: P08-08. Priority: p2. Done when: Use the approved provider/region and production tier. Verify actual source/target MongoDB and driver compatibility, storage limits, backup/restore capabilities, cost alerts and separate administrative ownership.
- [ ] **P09-02 - Create app, parser and migration database roles**
  - After: P09-01. Priority: p1. Done when: Use distinct credentials scoped to required databases/collections; avoid root/admin users in normal app/parser runtime. Enable provider-account MFA and store credentials only in approved secret stores.
- [ ] **P09-03 - Restrict Atlas network access and require TLS**
  - After: P09-02. Priority: p1. Done when: Allow only confirmed NAS egress and later hosting egress/private networking. Plan for changing residential IPs; do not default to 0.0.0.0/0. Validate TLS/SRV/DNS connectivity without printing a connection string.
- [ ] **P09-04 - Rehearse a complete migration in an isolated database**
  - After: P09-03. Priority: p1. Done when: Use an encrypted consistent dump/restore with compatible tools. Include shared catalogs, game rules, account/player progress, schema backups and indexes; separately verify uploaded file/metadata backups. Compare IDs, types, counts and sample references.
- [ ] **P09-05 - Schedule and announce a short write freeze**
  - After: P09-04. Priority: p1. Done when: Choose a maintenance window and cutover owner. Pause the parser and all old app writers, drain in-flight work and take final database plus media manifests/backups. No standalone dump is assumed consistent while writes continue.
- [ ] **P09-06 - Restore the final dataset and switch NAS configuration**
  - After: P09-05. Priority: p1. Done when: Restore into the managed target, verify indexes and integrity, update only DB secrets/config and start one application writer. Preserve Auth0 issuer/sub mapping, game/character/event IDs and completion records.
- [ ] **P09-07 - Validate production against the managed database**
  - After: P09-06. Priority: p1. Done when: Check guest/editor/user permissions, story completion, character collections, inventory, image references, concurrency and one controlled parser run. Confirm no old local writers remain connected.
- [ ] **P09-08 - Enable tested backups and recovery monitoring**
  - After: P09-07. Priority: p2. Done when: Set automated backup retention, encrypt an independent export as appropriate and restore to an isolated target. Monitor connectivity, capacity, long-lived catalog document size and account/progress writes.
- [ ] **P09-09 - Document a non-destructive cutover rollback**
  - After: P09-08. Priority: p1. Done when: Before writes resume, reverting the connection is straightforward. After new writes exist, keep the managed DB authoritative or reconcile them deliberately; never point back to a stale local snapshot and silently lose user progress.
- [ ] **P09-10 - GATE - accept the managed database**
  - After: P09-09. Priority: p1. Done when: Record integrity checks, one restore drill and successful NAS operation for an agreed observation period. Retain the old DB as a restricted recovery copy, with its parser/app writers disabled.

### 10 - Public hosting and automated deployment

Exit gate: a tested release is deployed to the public host with durable data and controlled promotion.

- [ ] **P10-01 - Provision the approved cloud application service**
  - After: P09-10. Priority: p2. Done when: Create a Docker web service in the chosen region with budget/usage alerts and least-privilege provider accounts. Restrict reviewer access until launch and keep this inactive replacement from accepting competing production writes. Verify the tested image's PORT, health checks and limits.
- [ ] **P10-02 - Finish durable cloud media migration**
  - After: P10-01. Priority: p1. Done when: Copy uploaded media and metadata to the approved storage adapter, compare checksums and preserve existing API references. Restart/redeploy the service to prove images survive; do not rely on ephemeral container disk.
- [ ] **P10-03 - Configure production secrets and network policies**
  - After: P10-02. Priority: p1. Done when: Store DB/Auth0/storage values in provider secrets, restrict object-store permissions and allow the service's actual outbound network in Atlas. Deploy no root DB user or SPA client secret.
- [ ] **P10-04 - Configure domain, HTTPS and authentication**
  - After: P10-03. Priority: p1. Done when: Set the final domain, DNS, TLS and exact Auth0 callbacks/logout/web origins. Preserve existing account identities, verify refresh/logout and reject mismatched tokens; test deep links and private image access under the final origin.
- [ ] **P10-05 - Automate digest-specific cloud promotion**
  - After: P10-04. Priority: p1. Done when: After all checks and image smoke tests pass for merged main, deploy the approved image digest through the provider API. Verify the deployment reports the expected SHA; disable any competing deploy-on-push path that can skip the gate.
- [ ] **P10-06 - Add deployment concurrency and rollback controls**
  - After: P10-05. Priority: p1. Done when: Serialize releases, hold migrations with data impact for approval, poll health and run a post-deploy smoke. On failure restore the previous compatible image and alert; record the last known good digest and keep deployment credentials secret.
- [ ] **P10-07 - Choose the final parser execution location**
  - After: P10-06. Priority: p2. Done when: Prefer a managed scheduled container if cost/browser/network tests pass; otherwise retain NAS scheduling against the managed DB with monitoring. Record the single authoritative scheduler and avoid a second active writer.
- [ ] **P10-08 - Cut parser scheduling over safely if moving it**
  - After: P10-07. Priority: p1. Done when: Stop the NAS job first. Make leases/reports durable in MongoDB/object storage, run the exact parser image and preserve --months=2. For Render UTC cron, choose 11:00 Monday UTC for 06:00 New York standard time and 10:00 UTC during daylight time, or use a timezone-aware scheduler.
- [ ] **P10-09 - Move active production traffic to cloud hosting**
  - After: P10-08. Priority: p2. Done when: Freeze writes briefly if needed, verify cloud health, then switch the canonical application URL and retire the NAS web writer. Keep NAS private as a compatible recovery target; both recovery configuration and bookmarks must point to the authoritative managed DB.
- [ ] **P10-10 - GATE - rehearse a public-host release and rollback**
  - After: P10-09. Priority: p1. Done when: Verify one automated release, a failed rollout, a rollback, persisted uploads/progress and scheduled parser recovery. The final SHA/digest must match CI evidence and no NAS port forwarding should be required.

### 11 - Public go-live readiness and operations

Exit gate: the application is safe to publish, supportable and recoverable.

- [ ] **P11-01 - Complete a public security review**
  - After: P10-10. Priority: p1. Done when: Review access control, account isolation, upload/file validation, unsafe Markdown/XSS, request limits, CORS, proxy headers, CSP and other security headers. Address findings with regression tests; do not mistake passing CI for a full security assessment.
- [ ] **P11-02 - Verify secrets and administrative access**
  - After: P11-01. Priority: p1. Done when: Scan source/history/images and public diagnostics, rotate any exposed or obsolete credentials, enforce MFA and least privilege, and document emergency revocation. Remove unused NAS/cloud/Auth0 permissions and temporary DB access-list entries.
- [ ] **P11-03 - Publish privacy, support and content policies**
  - After: P11-02. Priority: p2. Done when: Explain personal data, auth/storage providers, feedback retention, account deletion/export and support contacts. Review licensed artwork/source attribution and visibility before publication; obtain appropriate policy/legal review for the intended audience.
- [ ] **P11-04 - Exercise data export and deletion**
  - After: P11-03. Priority: p2. Done when: Verify users can recover/export intended personal data and request or perform deletion. Ensure deletion removes the correct account's progress/feedback without deleting shared game data; document backups and retention exceptions.
- [ ] **P11-05 - Check accessibility and essential browser journeys**
  - After: P11-04. Priority: p2. Done when: Verify keyboard focus, screen-reader labels, dropdowns, contrast, reduced motion, responsive layouts, 404/error recovery, empty/loading states and expired-login recovery. Confirm game navigation and shared links work without a developer session.
- [ ] **P11-06 - Configure monitoring and actionable alerts**
  - After: P11-05. Priority: p2. Done when: Monitor readiness, error rates, slow requests, DB/storage capacity, certificate expiry, failed deploys, stale parser data and missed backups. Set an accountable alert destination and remove tokens/PII from logs.
- [ ] **P11-07 - Practice incidents and database/media restoration**
  - After: P11-06. Priority: p1. Done when: Rehearse bad release, auth failure, provider outage, corrupt upload and parser failure. Restore into an isolated target, measure RPO/RTO and document when to roll back code versus restore data or fix forward.
- [ ] **P11-08 - Create recurring operating checklists**
  - After: P11-07. Priority: p2. Done when: Assign weekly failed-job/feedback review, monthly dependency and cost review, periodic access review and restore drills. Track renewal dates and backup retention; create recurring Todoist tasks separately once owners/cadence are agreed.
- [ ] **P11-09 - GATE - approve public launch**
  - After: P11-08. Priority: p1. Done when: Require P01-09, P02-08, P03-10, P04-08, P05-12, P06-10, P07-10, P08-08, P09-10, P10-10 and the tasks in this phase. Publish only reviewed games/features, with no unresolved access/data-loss blockers and a named rollback owner.

### 12 - Launch, promotion and portfolio

Exit gate: the public launch is verified and the portfolio describes evidence-backed work.

- [ ] **P12-01 - Publish the first public release**
  - After: P11-09. Priority: p1. Done when: Tag the tested release, publish reviewed changelog notes, confirm domain/login/guest paths from an external network and watch errors, usage and costs during the initial launch window. Announce only after the launch gate passes.
- [ ] **P12-02 - Perform post-launch acceptance and feedback review**
  - After: P12-01. Priority: p2. Done when: Check real user sign-in, account isolation, event freshness, saved progress and image delivery after launch. Review early feedback and execute the rollback plan if a release blocker appears.
- [ ] **P12-03 - Prepare a public project landing page and README**
  - After: P12-02. Priority: p3. Done when: Explain the product, supported games/features, screenshots, live URL, setup boundaries and contribution/support process. Keep credentials, internal NAS details and private-user data out of examples.
- [ ] **P12-04 - Create a portfolio case study**
  - After: P12-03. Priority: p3. Done when: Describe Angular/TypeScript UI, shared-data versus personal-progress design, Auth0 authorization, CI/browser tests, parser scheduling, Docker/NAS and managed-cloud delivery. Include architecture, tradeoffs and measured results with redacted screenshots.
- [ ] **P12-05 - Add accurate resume and profile entries**
  - After: P12-04. Priority: p3. Done when: Summarize your own engineering and product decisions, describe AI-assisted development candidly and link the live demo/repository where appropriate. Use only verified user, coverage, performance or reliability metrics; do not invent scale.
- [ ] **P12-06 - Prepare promotion materials and a safe demo**
  - After: P12-05. Priority: p4. Done when: Create a short walkthrough and guest/demo path that cannot alter another user's data. Verify screenshot/media permissions, label beta limits and choose relevant communities whose promotion rules permit the post.
- [ ] **P12-07 - Publish announcements and collect results**
  - After: P12-06. Priority: p4. Done when: After reviewing the final text yourself, share through selected personal/professional/community channels. Track useful feedback, engagement and conversion without invasive analytics; do not post automatically as part of a code deployment.
- [ ] **P12-08 - Review the first month and prioritize improvements**
  - After: P12-07. Priority: p3. Done when: Compare support issues, parser freshness, cost, reliability and real usage against launch targets. Update the roadmap, recurring maintenance tasks and portfolio evidence; remove unused infrastructure.

## Operational details that must not be lost

### Permissioned publication

Use editor-only visibility as a real server-side policy. Hiding a game in navigation is insufficient. Game data, story sections, shared characters/events, search suggestions, relationships, counts and image delivery must obey effective parent visibility. Shared records referenced by both public and restricted content need an explicit publication policy; a reference must never implicitly publish its target. Public release notes and feedback attachments also need review for hidden content.

Preserve all IDs and personal completion during visibility/data migrations. Keep private user collections separate from the shared game catalog. New games/content should require deliberate publication; migrate existing items only after checking their intended audience.

### NAS deployment and friend access

Use bridge networking for containers; expose the app through private HTTPS and keep MongoDB internal. Have the NAS pull tested releases, avoiding inbound access from hosted CI. Do not put an untrusted-PR self-hosted runner on your production NAS. Protect the Docker/Container Manager control surface: deployment automation has powerful local permissions and must accept only trusted release metadata and fixed commands.

Friends can initially use a restricted VPN/shared-device arrangement. Tailscale provides device sharing; verify the actual application port, DNS, certificate trust and network policy before inviting users. Give no DSM/SSH/database access. See [Tailscale device sharing](https://tailscale.com/docs/features/sharing).

Use individual Auth0 accounts and preserve the existing tenant issuer/sub identity during migration. The current identity mapping depends on issuer plus subject; casually changing tenants can disconnect users from stored progress. A new domain or SPA client requires deliberate origin/client configuration and identity verification, not a production authentication bypass.

### Parser schedule and source reliability

The initial schedule is Monday at 06:00 America/New_York. DSM Task Scheduler uses the configured NAS timezone; verify it. Cron equivalent: 0 6 * * 1 in that timezone. Game server reset offsets and calendar-day normalization are independent of the scheduler timezone.

The current parser image already runs headed browsers through Xvfb; preserve that behavior until headless parity is demonstrated. The normal write command is npm run parser:weekly -- --report=/reports/<timestamp>.json; its script already requests --months=2. Preview first with npm run parser:preview -- --report=/reports/<timestamp>-preview.json. Pass supported --game filters for targeted recovery. These are implementation instructions, not commands executed by this plan.

Measure each game's source freshness and distinguish complete, partial, blocked and failed imports. Keep static recurrence generation reliable even when a dynamic source fails. Do not delete dynamic/history records merely because a source is unavailable. A parser run that imports valid data but fails another source is still partial, not a fully green run.

If using Render cron later, its schedule is UTC and cron containers have no persistent disk. A New York 06:00 schedule therefore requires daylight-saving handling or a different timezone-aware scheduler. Reports and cross-host leases must move to durable services; never rely on an ephemeral file lock as a distributed lock. See [Render scheduled containers](https://render.com/docs/cronjobs).

### Database and cloud cutovers

Migrate the database separately from the website. First keep the NAS app working against the managed database; only then move application hosting. Freeze all writers for a consistent final transfer, preserve indexes and account/shared IDs, and validate uploads separately. An old local database is a recovery snapshot, not an automatic failback target after cloud writes have resumed.

Atlas network access is allowlisted; account for changing residential egress during the NAS-to-Atlas phase. Later use the hosting service's confirmed outbound ranges or approved private/dedicated networking rather than opening the database globally. See [Atlas access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/) and [Render outbound networking](https://render.com/docs/outbound-ip-addresses).

A Render image-backed service can consume registry images by digest, supporting the proposed build-once promotion model. Verify the selected provider API updates the intended digest and confirms the running version before enabling automatic releases. Public/private media must survive replacement containers; object storage is the proposed durable solution, with authorized delivery for restricted files. See [prebuilt-image deployment](https://render.com/docs/deploying-an-image).

### Release and recovery rules

| Failure | Immediate action | Recovery requirement |
| --- | --- | --- |
| CI/review fails | Keep the promotion PR blocked | New green candidate and current merge checks |
| New container fails readiness | Stop promotion; restore previous compatible app digest | Retain previous image/config and inspect failure logs |
| Migration is incompatible | Keep writes stopped; assess fix-forward or restore | Explicit data-impact decision; no automatic destructive rollback |
| Parser is partial/blocked | Alert, preserve valid data and retry bounded sources | Durable report, safe lease recovery and no deletion of history |
| Managed DB outage after new writes | Stop unsafe writes and preserve authoritative state | Provider recovery or deliberate reconciliation; never stale-snapshot failback |
| Permission/data leak | Restrict affected access and revoke credentials if needed | Fix, regression tests, incident assessment and appropriate user communication |

Keep backups encrypted and off the NAS as well as any local copy. A database-only backup is incomplete: uploaded binaries, attribution/metadata, configuration and release manifests also matter. A successful backup job does not prove a successful restore; practice recovery to an isolated target and measure the agreed RPO/RTO.

### Portfolio example to adapt after launch

Built and deployed a multi-game progress application using Angular, TypeScript, Auth0 and MongoDB; implemented editor-controlled publication, automated CI and browser tests, container deployments, and scheduled event-data imports.

Add a verified result once available, such as measured load-time improvement or real active-user count. Describe your own design, implementation and operating work accurately, including AI assistance where relevant. Link to a safe demo and case study; keep personal data and private infrastructure details out of screenshots.
