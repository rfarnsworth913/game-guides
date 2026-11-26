# Continuous integration and promotion

The workflows validate pull requests, pushes to `main`, `dev` and `ai`, and merge-queue candidates. Deployment remains separate from CI. Nothing here connects a GitHub-hosted runner to the NAS or grants access to the application database or Auth0 tenant.

## Required checks

| Check name | Work performed |
| --- | --- |
| `lint` | Repository ESLint checks; errors block the job. Existing stylistic warnings remain visible. |
| `test` | Middleware/parser type checks, tooling tests, middleware/security tests, Angular tests and parser unit tests, with coverage enabled. |
| `build` | Production Angular build including bundle budgets; uploads `dist/guides-app/` with its commit SHA. |
| `workflow-validation` | All workflow YAML and embedded shell are checked with checksum-verified actionlint 1.7.12. |
| `dependency-review` | Pull requests introducing high/critical dependency vulnerabilities fail. This job is skipped for non-PR events, including merge groups; the normal PR check still runs. Enable the dependency graph in repository settings. |
| `browser-integration` | Parser browser fixtures and the full application suite using disposable MongoDB, isolated test tokens and Playwright Chromium. |

The workflow source does not enable GitHub branch rules. After these checks have run on GitHub, an administrator must configure the following once:

1. Open **Settings → Rules → Rulesets → Import a ruleset** and import [protected-branches.json](../.github/rulesets/protected-branches.json). Review it before saving. It applies only to `main`, requires pull requests, current successful checks and resolved review threads, and prevents deletion/force-pushes. There are no bypass actors. It permits zero mandatory human approvals so solo development remains possible; raise this when a reviewer is available.
2. Confirm that the six check names above match the actual checks GitHub reports. Resolve any existing conflicting rules rather than creating contradictory requirements.
3. Enable **Dependency graph** and **Dependabot alerts** under repository security settings. Dependency review is available for this public repository; private repositories need the corresponding GitHub security entitlement.
4. Under **Settings → General → Pull Requests**, enable **Allow auto-merge** and allow merge commits. Merge commits retain the history between the long-lived `dev` and `main` branches.
5. Add an Actions repository variable named `ENABLE_DEV_AUTO_MERGE` with the value `true` only after the required checks and ruleset are active.
6. Open a pull request from this repository's `dev` branch into `main`. The promotion workflow enables auto-merge for that PR. It never creates a PR, checks out PR code, bypasses checks, or enables auto-merge for forks, other branches or draft PRs. The workflow first verifies effective main-branch rules; if the required gates are absent it fails closed.

The auto-merge workflow uses `pull_request_target` solely for GitHub API operations from the trusted base workflow. Keep it free of checkout, package installation and execution of PR content. Read/write permissions are confined to its promotion job. Disable the repository variable to stop enabling auto-merge on future events; also disable auto-merge on already-enabled PRs if needed.

Merge queues are optional. The CI/browser workflows already handle `merge_group`; enabling a queue still requires repository settings and plan support. Do not make the promotion helper itself a required check: it is intentionally absent on most PRs.

## Coverage and artifacts

Run `npm run test:ci` locally to execute the same coverage-enabled checks. The normal `npm test` remains available without coverage overhead.

- `coverage/guides-app/`: Angular HTML, LCOV, JSON summary and console summary.
- `coverage/data-parser/`: parser HTML, LCOV, JSON summary and console summary. Includes shared common modules used by the parsers; test fixtures and CLI entry points are excluded.
- `coverage/middleware/`: native V8 JSON profiles. Node prints its coverage summary in the test log. These raw profiles are not LCOV and must be converted before use by an LCOV-only service.

CI retains coverage and production build artifacts for 14 days. Browser failures retain screenshots and installation/parser/integration logs for seven days. Bash pipe failures propagate through `tee`; logging cannot turn a failed test into a successful job. Uploaded build artifacts come from the tested commit but are not deployed automatically.

Coverage currently establishes a baseline; no arbitrary percentage gate has been added. Review the reports, agree on useful module-level thresholds, and raise them alongside meaningful tests. Coverage reporting does not replace browser integration or authentication tests.

## Dependency and workflow maintenance

Dependabot checks npm dependencies and pinned GitHub Actions weekly on Mondays. Vitest and its coverage provider are grouped to keep their versions aligned. Dependency update PRs receive the same checks as other PRs and are not automatically merged by the dev-promotion workflow.

The separate **Dependency audit** workflow runs Mondays at 13:00 UTC and can be started manually. It audits the full lockfile, fails on high/critical advisories, and retains its JSON report for 30 days even when the audit fails. It is deliberately separate from the required PR gate: dependency review blocks newly introduced high/critical findings, while the scheduled audit tracks the existing backlog. The November 26 installation reported 31 advisories, including 10 high and two critical; those findings need a dependency-remediation review. No `npm audit fix --force` was applied and no advisories were suppressed.

All third-party Actions are pinned to verified full commit SHAs. actionlint is downloaded at a fixed version and its archive is SHA-256 checked before extraction. To upgrade actionlint, update both its version and archive checksum, verify against the official release, and run it locally or in CI.

NAS deployment, production credentials and a deployment runner require the separate [deployment roadmap](deployment-roadmap-2026-11-24.md). A future deployment job should consume a successful `main` build and use its own environment/permissions; it should not run on pull requests.
