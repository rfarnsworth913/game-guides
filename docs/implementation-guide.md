# Branches, review, CI, and deployment implementation guide

Prepared October 19, 2026 for `rfarnsworth913/game-guides`.

This is an implementation runbook. Creating it does not change branches, configure GitHub, install CodeRabbit, or deploy the application. Commands below are for a maintainer to run deliberately, in order. Shell commands use PowerShell unless marked YAML. Recheck branch state before executing them.

## 1. Understand the actual starting point

Remote branch heads were verified with `git ls-remote` when this guide was written:

| Branch | Head | Current role |
| --- | --- | --- |
| `origin/main` | `737a0a1` | GitHub default branch; older parser/application layout |
| `origin/master` | `4421324` | Older branch in the current application lineage |
| `origin/dev` | `bbba64e` | Manual maintenance work |
| `origin/ai-test` | `2f459d8` | Current application, authentication, story guides, and recent UI work |
| `ai` | Does not exist | Desired name for AI integration |

Local checkout: `ai-test`, initially clean before this document was added. Local `master`, `dev`, and `themes-rework` also exist. A local `main` does not yet exist. Remote `main` already exists: do not rename `master` over it.

Two distinct reconciliation problems exist:

- `dev` and `ai-test` share ancestor `72e758b`. `dev` has **4** unique commits, and `ai-test` has **8**. The manual changes include header cleanup, data-service tests, formatting, and theme types. Neither branch contains all of the other.
- `main` and `dev` have **unrelated histories**. Their root commits are `5037116` and `78e58f5`. A normal merge cannot connect them. GitHub may also refuse to open a direct comparison PR until the histories are connected.

The one-time integration in steps 3 and 7 preserves both histories. Do not use a force push, hard reset, or blanket "ours/theirs" conflict resolution to make the branches appear synchronized.

The remote `main` tree also tracks `.env`. Do not publish that file in reviews, artifacts, or logs. If it contains real credentials, rotate those credentials and plan history cleanup separately; removing a file from the current tree does not remove its history.

## 2. Preserve the starting state and standardize tools

1. Review and commit this guide and its README link on the current `ai-test` branch, or preserve your work in a separate branch. Do not switch branches with unrelated uncommitted changes.
2. Before switching branches, save your working `.env` outside the repository. The older `main` tracks that path, and switching to it could replace an ignored local file. For example:

```powershell
$pipelineBackup = Join-Path $env:LOCALAPPDATA 'GameGuides/pipeline-backup-20261019'
New-Item -ItemType Directory -Force -Path $pipelineBackup | Out-Null
if (Test-Path -LiteralPath .env) { Copy-Item -LiteralPath .env -Destination (Join-Path $pipelineBackup 'working.env') }
```

Keep that backup private. Restore it only after `.env` is untracked/ignored in the reconciled tree; never stage it. Then fetch current refs and inspect them:

```powershell
git status --short
git fetch origin --prune
git branch -avv
git rev-list --left-right --count origin/dev...origin/ai-test
git merge-base origin/dev origin/ai-test
git merge-base origin/main origin/dev
```

The last command currently returns no hash and exits nonzero, confirming unrelated histories. If your results differ from the snapshot, adapt the reconciliation steps rather than copying them blindly.

3. Create backup refs locally, then push them if your repository policy permits:

```powershell
git branch backup/main-before-pipeline-20261019 origin/main
git branch backup/dev-before-pipeline-20261019 origin/dev
git branch backup/ai-before-pipeline-20261019 origin/ai-test
git push origin backup/main-before-pipeline-20261019 backup/dev-before-pipeline-20261019 backup/ai-before-pipeline-20261019
```

4. Standardize local development and CI on Node **24.15.0 or a newer compatible 24.x patch**. The installed Angular package requires `^22.22.3 || ^24.15.0 || >=26.0.0`. The current machine uses Node 25.7.0, which is outside that declared range. Add a `.node-version` with the chosen exact 24.x release; use the same version in CI and deployment. The examples below use `24.15.0` as the minimum, not as a promise that it is the latest patch.
5. Run `npm ci`, `npm test`, and `npm run ui:build` after selecting that Node version. Do not copy `.env` into CI.

Baseline observed on the current checkout: middleware type checking and all standard tests passed (28 middleware, 93 UI, 39 parser tests). That local run used Node 25.7.0, so repeat it on the selected Node 24 release. The frontend build has an existing initial-bundle warning. Repository-wide lint currently fails; step 5 is required. These checks do not establish that the divergent `dev` or `main` branches pass.

## 3. Reconcile the manual and AI work into dev

Create a temporary integration branch from the latest remote `dev`:

```powershell
git switch --create setup/reconcile-ai origin/dev
git merge --no-ff --no-commit origin/ai-test
```

Git may stop with conflicts; this is expected. Resolve one file at a time:

- Preserve the newer workspace, middleware, Auth0 integration, and story features from `ai-test`.
- Carry forward the intent of the four manual commits from `dev`, adapting their header/theme/test changes to the newer architecture where necessary.
- For dependencies, decide the intended `package.json` first, then regenerate `package-lock.json` with the chosen Node/npm toolchain. Do not hand-combine lockfile sections.
- Keep shared catalog definitions separate from account progress and guest localStorage.

Review the result with `git diff`, `git diff --cached`, and `git status`. Stage only the files you have reviewed, using `git add <path>`. When the merge is ready:

```powershell
npm ci
npm test
npm run ui:build
git commit -m "Integrate current AI application with manual dev changes"
git push --set-upstream origin setup/reconcile-ai
```

Open a PR: **`setup/reconcile-ai` -> `dev`**. Record how each manual commit was preserved or intentionally adapted. Review it, then use **Create a merge commit**. Do not squash this reconciliation PR: its shared ancestry is needed for subsequent synchronization.

If you need to abandon the local merge before committing, `git merge --abort` returns to the pre-merge state. Do not discard individual conflict changes unless you have preserved them.

Success: `dev` contains the latest application and the reviewed manual work.

## 4. Introduce ai without deleting ai-test

Create the desired `ai` branch at the existing AI tip:

```powershell
git fetch origin
git switch --create ai origin/ai-test
git push --set-upstream origin ai
```

Now synchronize reviewed `dev` back into `ai` through a temporary branch:

```powershell
git switch --create sync/dev-into-ai origin/ai
git merge --no-ff origin/dev
git push --set-upstream origin sync/dev-into-ai
```

Open **`sync/dev-into-ai` -> `ai`**, validate, and merge with a merge commit. Keep `ai-test`, `master`, and `themes-rework` for now. They can be archived/deleted in a later housekeeping task after checking no work or automation depends on them.

## 5. Make lint and integration checks usable

Create `setup/ci-review` from the now-integrated `dev`.

### Lint prerequisite

Lint configuration is implemented as of October 27, 2026:

1. `lint` delegates to `lint:ci`, which explicitly checks common, middleware, parser, and Angular sources. `ui:lint` includes external HTML templates and inline component templates.
2. Each project has a `tsconfig.lint.json` covering its source and tests. ESLint uses these explicit projects with type-aware rules enabled; it does not rely on the project service discovering shared files.
3. Jest rules apply only to parser Jest tests. Angular Vitest tests and middleware Node tests retain shared TypeScript checks without Jest rules. Angular component rules and inline template processing apply only to UI sources.
4. Generated output, dependencies, database files, backups, temporary files, coverage, and `.angular` are ignored globally. Existing formatting preferences remain unchanged; avoid applying repository-wide autofixes during feature changes.
5. `typescript-eslint`, previously a transitive dependency, is now a direct development dependency. The lockfile is updated. The CI script is:

```json
"lint:ci": "eslint projects/common projects/middleware/src projects/data-parser/src projects/guides-app/src"
```

The configuration now completes linting without fatal project-association errors. The repository still has existing code errors and formatting warnings; see [the lint baseline](lint-baseline-2026-10-27.md). `lint:ci` fails on errors and reports warnings, without `continue-on-error` or `|| true`. Once the warning baseline is cleaned up, optionally add `--max-warnings=0`.

6. Run `npm run lint:ci` locally until it exits successfully.

### Browser integration prerequisite

`npm test` already runs the normal API/security, Angular, and parser suites without a live database or Auth0 tenant. `npm run ui:e2e` is separate. Its current smoke script sets legacy OIDC/session fixtures while the runtime uses Auth0 bearer tokens.

Before making E2E required:

1. Update the smoke harness to use an isolated test issuer/JWKS and test-signed access tokens through the actual Auth0 validation path, or a dedicated test application/tenant for interactive provider testing.
2. Keep test-only issuer/key injection confined to the test harness. Never weaken production token validation or add a production authentication bypass.
3. Use a disposable MongoDB database and isolated browser profiles. Isolate the schema-backup and player-progress collections and uploaded assets too; inspect cleanup rather than assuming a random catalog collection isolates everything.
4. Verify guest operation, editor authorization, account isolation, completion persistence, concurrent edits, image uploads, and logout behavior. Current bearer-token logout does not revoke every previously issued JWT.
5. Run this job on a hosted Ubuntu runner with a disposable MongoDB service and the browser libraries Puppeteer needs. Adapt host-port/origin assumptions in the existing launcher as needed.

Keep E2E as an explicit tracked prerequisite until it works. A passing unit-test workflow alone is not the final "all tests" gate.

## 6. Add GitHub Actions and CodeRabbit

### CI workflow

Add `.github/workflows/ci.yml` on `setup/ci-review` after `lint:ci` works:

```yaml
name: CI
on:
  pull_request:
    branches: [main, dev, ai]
  push:
    branches: [main, dev, ai]
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
jobs:
  checks:
    name: ${{ matrix.check }}
    runs-on: ubuntu-latest
    timeout-minutes: 20
    strategy:
      fail-fast: false
      matrix:
        check: [lint, test, build]
    env:
      PUPPETEER_SKIP_DOWNLOAD: "true"
    steps:
      - uses: actions/checkout@v6
        with:
          persist-credentials: false
      - uses: actions/setup-node@v6
        with:
          node-version-file: .node-version
          cache: npm
      - run: npm ci
      - if: matrix.check == 'lint'
        run: npm run lint:ci
      - if: matrix.check == 'test'
        run: npm test
      - if: matrix.check == 'build'
        run: npm run ui:build
```

The action major versions above are supported examples; pin reviewed action revisions to full commit SHAs before relying on the pipeline for deployment. No production credentials are needed for these jobs. Unit tests mock parser/browser integrations, so skipping the Puppeteer download is intentional here; the E2E job must install its browser separately.

After the E2E harness prerequisite is complete, add an always-scheduled `e2e` job to this workflow with its own MongoDB service and browser installation, and make it required. Keep production credentials out of it. Add `merge_group` as an event only if you later enable GitHub merge queues.

### CodeRabbit

1. Install the CodeRabbit GitHub App for `rfarnsworth913/game-guides`, granting access only to this repository if possible. Check the available features for your repository visibility and subscription.
2. Add `.coderabbit.yaml`:

```yaml
language: en-US
reviews:
  profile: chill
  request_changes_workflow: false
  auto_review:
    enabled: true
    drafts: false
    base_branches:
      - "^main$"
      - "^dev$"
      - "^ai$"
  path_instructions:
    - path: "projects/guides-app/**"
      instructions: >-
        Check accessibility, Angular state handling, component boundaries,
        and reuse of maintained components. Avoid unrelated formatting rewrites.
    - path: "projects/middleware/**"
      instructions: >-
        Check verified identity, editor authorization, account isolation,
        origin validation, upload validation, and concurrency protections.
    - path: "projects/common/**"
      instructions: >-
        Preserve stable IDs, stored-data compatibility and runtime validation.
        Keep player state out of shared catalog definitions.
    - path: "projects/data-parser/**"
      instructions: >-
        Check malformed input handling and repeatable imports.
        Preserve manually maintained game content and existing progress data.
```

Additional base-branch patterns are needed because CodeRabbit otherwise targets the default branch by default. These patterns are anchored to avoid unintentionally matching names such as `dev-old`.

3. Open **`setup/ci-review` -> `dev`**. Confirm automatic review, new-commit review, and all three CI jobs actually run. If repository configuration prevents initial automatic review, request one explicitly through CodeRabbit.
4. Address or explain findings. Initially retain manual merge control rather than letting CodeRabbit approve and merge its own fixes.
5. Merge the PR, then propagate `dev` into `ai` with another synchronization PR. Install the same config on `main` through the history bridge in step 7.

Add a small PR template covering behavior, tests, data changes, and screenshots when relevant. Add maintainer-authored `AGENTS.md` guidance and a maintenance document so future AI changes reuse refactored components. Do not create fictitious additional owners just to satisfy approval rules.

## 7. Connect main's unrelated history once

Do this only after the reconciled `dev` is reviewed and CI is working. Keep automated deployment disabled during the transition.

```powershell
git fetch origin
git switch --create main --track origin/main
git switch --create setup/connect-main-history
git merge --allow-unrelated-histories --no-ff --no-commit origin/dev
```

If local `main` now exists, switch to it and update it with `git pull --ff-only` instead of recreating it. The `--allow-unrelated-histories` flag belongs only in this intentional one-time bridge, not in daily merges.

Resolve conflicts deliberately:

- Preserve the reviewed application's `projects/guides-app`, middleware, shared models, and current parser layout.
- Inspect useful parser/service work unique to `main` and port its behavior/tests into the current layout. Do not blindly discard the older branch's unique improvements or restore its obsolete directory structure.
- Ensure CI, CodeRabbit, and the selected runtime/toolchain survive the merge.
- Untrack the `.env` inherited from `main` while keeping the local file:

```powershell
git rm --cached --ignore-unmatch .env
```

Verify `.env` is ignored and `.env.example` contains placeholders only. Review tracked configuration for actual secrets before committing. Do not print `.env` to diagnose this step.

Stage reviewed resolutions, run `npm ci`, `npm run lint:ci`, `npm test`, `npm run ui:build`, and the repaired E2E suite. Commit and push:

```powershell
git commit -m "Connect release history with the integrated application"
git push --set-upstream origin setup/connect-main-history
```

Open **`setup/connect-main-history` -> `main`**. This comparison now has a common ancestor because the bridge starts from `main`. Review the large baseline release carefully. Merge with **Create a merge commit** to retain both parents and histories. Do not squash or rebase this bridge PR.

Then back-merge `main` into `dev` through a `sync/main-into-dev` PR, and `dev` into `ai` through a `sync/dev-into-ai` PR. This makes the bridge and its conflict resolutions part of every active branch.

Verification:

```powershell
git fetch origin
git merge-base origin/main origin/dev
git merge-base origin/dev origin/ai
git merge-base --is-ancestor origin/main origin/dev
```

Both merge-base commands should return a hash. After back-synchronization, the ancestor check should exit successfully. Leave legacy branches in place until this is verified.

## 8. Turn on branch protections after checks exist

In GitHub, use **Settings > Rules > Rulesets** or branch protection settings, subject to your plan's availability. Keep `main` as the default branch.

| Rule | main | dev | ai |
| --- | --- | --- | --- |
| Require pull requests | Yes | Yes | Yes |
| Block force pushes and deletion | Yes | Yes | Yes |
| Require resolved conversations | Yes | Yes | Yes |
| Require lint, test, build | Yes | Yes | Yes |
| Require repaired E2E | Yes | Yes | Prefer yes |
| Release/merge decision | You | You | You |

Select the actual check names produced by a completed run rather than guessing their display names. Initially treat CodeRabbit comments as review input. If later making its status required, verify what the selected status guarantees: review completion is not the same as approval or absence of findings.

For a solo maintainer, require PRs and checks but do not require another human approval that you cannot obtain. With a second maintainer, require one independent approval and dismiss stale approvals after new changes. Keep any emergency bypass narrowly assigned and documented.

Allow merge commits. You may also enable squash merging for short-lived feature PRs, but use merge commits for long-lived branch synchronization and release PRs. Do not require linear history if your chosen branch policy depends on merge commits. Do not auto-delete `ai` or `dev` after a release.

## 9. Use the new branches daily

Manual change:

```powershell
git fetch origin
git switch --create dev/refactor-image-picker origin/dev
```

Implement, test, commit, push, and open a PR into `dev`.

AI change:

```powershell
git fetch origin
git switch --create ai/improve-story-navigation origin/ai
```

Open a PR into `ai`, then promote ready work with a reviewed **`ai` -> `dev`** PR. Do not accumulate unrelated unfinished experiments on `ai`, because promoting that branch promotes all its unmerged changes. Keep experiments on temporary branches until ready.

Release: open **`dev` -> `main`**, pass all checks, review, and merge with a merge commit. Deployment follows that accepted release. Back-merge `main` to `dev` and then `dev` to `ai` as needed to preserve common history and reviewed fixes. Use synchronization branches/PRs rather than direct pushes to protected branches.

If you enable GitHub auto-merge later, it should wait for the same checks and review gates. It should not bypass them. Keep deployment approval separate from merge automation initially.

## 10. Add local deployment as a separate implementation phase

The project does not yet have a production release package, Docker setup, or local deployment workflow. `npm start` launches a development Angular server and watch-mode middleware. It is not the deployment entry point. Do not treat a copied checkout plus `npm start` as the completed production pipeline.

Recommended target: a dedicated Linux VM/local server, with Docker Compose for a reverse proxy, Node middleware, and MongoDB. Windows hosting is also possible, but would require a separately designed service and reverse-proxy setup rather than copying Linux commands.

Create a `dev/production-packaging` PR and complete these changes before automating deployment:

1. **Backend runtime:** add an explicit production build and non-watch start command. Resolve/bundle TypeScript imports so built JavaScript runs without development-only loaders. Include shared modules and verify from a clean installation.
2. **Container networking:** the middleware currently listens on `127.0.0.1`. If it is a separate container, add a configurable bind address and use `0.0.0.0` inside its private container network. Do not publish the API port publicly; expose it through the proxy.
3. **Static frontend:** serve `dist/guides-app/browser` (verify the build output) through the proxy, with SPA route fallback. Proxy `/api` to middleware before applying that fallback. No Angular development server in deployment.
4. **Images:** add a configurable asset-storage root. Current uploads are written under `projects/guides-app/src/assets`. Mount a persistent directory and preserve/seed existing game images without overwriting uploaded metadata. Replacing an application release must not replace the image library.
5. **MongoDB:** use a persistent volume and credentials supplied at runtime. Separate staging and production databases, progress collections, schema backups, and image directories. Test restore as well as backup.
6. **Authentication:** use HTTPS, set `NODE_ENV=production` and the exact `APP_ORIGIN`, and register callback/logout/web-origin URLs with Auth0. Current public Auth0 settings are compiled from `projects/common/auth0-config.ts`; use deliberately reviewed environment-specific builds/configuration if staging differs. Private secrets stay on the server or in protected environment settings.
7. **Packaging:** add reviewed Dockerfile/Compose/proxy configuration. Build the frontend and backend in CI, publish an image identified by the full commit SHA/digest, and retain the previous release. Cache/dependency setup must not include `.env`, database files, or credentials.
8. **Health:** add container readiness checks and verify `/api/health` through the deployed HTTPS origin. Confirm a guide loads, an authorized account can save, and guest/account progress behave correctly.

Acceptance before deployment automation: the release starts from an immutable package on a clean host, survives restart, and keeps database/uploads unchanged across application replacements.

### Deployment workflow after packaging passes

1. Create GitHub environments `staging` and `production`; restrict branches to `dev` and `main`, respectively. Configure deployment approvals where supported by your plan. With a solo maintainer, check whether preventing self-approval would make deployment impossible.
2. Register a dedicated deployment runner with labels such as `self-hosted`, `linux`, `game-guides-deploy`. Hosted runners continue to execute PR code. The deployment runner should not execute arbitrary PR branches.
3. Add `.github/workflows/deploy-local.yml`, initially using `workflow_dispatch`. Accept a successful CI run ID/release digest and environment; do not accept an arbitrary shell command or filesystem path.
4. Verify the selected artifact/image was produced by this repository's trusted CI workflow, from a successful **push** run on the allowed branch and the intended commit. Never deploy PR artifacts solely because their names match. Download by verified run ID or image digest, not "latest".
5. Run a maintainer-controlled server-side deployment script. Serialize deployments per environment and do not cancel one halfway through replacing a release.
6. Script sequence: verify package identity -> back up affected data -> record previous image digest -> update Compose image -> start services -> wait for health -> run smoke checks -> record the deployed SHA. Preserve volumes throughout.
7. On failure, restore the previous application image and rerun health checks. Do not automatically restore an old database over newer player progress. Schema changes need an explicit compatibility/restore strategy; application rollback does not undo migrations.
8. Test one staging deployment, one failed health check/rollback, and one deliberate production deployment. Only then consider automatic staging deployment from successful `dev` push CI. Keep production explicitly approved initially.

The guide intentionally does not include a pretend runnable deployment YAML or host script before these project-specific runtime/storage changes exist. Build these in the packaging PR and validate them on the chosen host.

## 11. Completion checklist

- [ ] Backup refs created; local work preserved.
- [ ] Four manual and eight AI commits reconciled through review.
- [ ] `ai` exists and includes the maintained `dev` implementation.
- [ ] Selected Node 24 release works locally and in CI.
- [ ] Lint errors/configuration fixed; required lint command passes.
- [ ] Standard tests and production frontend build pass on hosted runners.
- [ ] Auth0-compatible browser/MongoDB E2E suite passes and is required.
- [ ] CodeRabbit reviews PRs into all three active branches.
- [ ] Main history bridge reviewed and merged without losing either lineage.
- [ ] `.env` untracked in the release tree; any real exposed credentials addressed.
- [ ] Rulesets enforce the intended checks without blocking the solo workflow.
- [ ] AI changes and manual maintenance follow the same release gates.
- [ ] Production packaging, persistent assets, and database restore tested.
- [ ] Local deployment validates the exact release and has a tested rollback.

## References

- [CodeRabbit configuration and base-branch review controls](https://docs.coderabbit.ai/reference/configuration)
- [CodeRabbit path-based instructions](https://docs.coderabbit.ai/configuration/path-instructions)
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub auto-merge](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request)
- [GitHub Actions runner security](https://docs.github.com/en/actions/reference/security/secure-use)
- [Official setup-node action](https://github.com/actions/setup-node)
- [Official checkout action](https://github.com/actions/checkout)

Branch details and local check results are observations of this repository, not statements from those external references.
