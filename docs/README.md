# Documentation

Use this index to find maintained guides. Deployment proposals describe work to implement; feature guides describe the existing application. Dated validation reports are evidence from a particular run, not a guarantee about today's data or test results.

## Development and operations

| Guide | Purpose |
| --- | --- |
| [Project README](../README.md) | Local startup, storage and standard check commands |
| [Environment configuration](environment.md) | Root `.env` fields, defaults, Auth0 editor access and parser/test overrides |
| [Code organization](code-organization.md) | Project ownership, imports and enforced boundaries |
| [Middleware](../projects/middleware/README.md) | API, authentication, persistence and migrations |
| [Browser integration](browser-integration.md) | Isolated E2E setup, coverage and limitations |
| [Data parsers](data-parsers.md) | Active parser pipeline, CLI, reports and unresolved source gaps |
| [Retained compatibility code](legacy-code.md) | Why particular adapters, migrations and regression implementations remain |
| [Theme](../THEME.md) | Shared styling and game highlight colors |

## Deployment

The [November 24 deployment roadmap](deployment-roadmap-2026-11-24.md) is the single current plan for CI, protected branch promotion, private NAS deployment, scheduled parsers, friend review and public cloud launch. Import the matching [Todoist CSV](deployment-roadmap-todoist-2026-11-24.csv) into an empty project to track it.

The older implementation guide, NAS/parser task exports and historical lint/parser reviews were superseded and removed. Do not interpret GitHub workflow files or this roadmap as proof that remote branch protections or deployment services are configured.

## Feature guides

| Area | Guides |
| --- | --- |
| Games | [Game management](game-management.md) |
| Shared image selectors | [Image library browser](image-library.md) |
| Characters | [Character management](character-management.md), [progression contracts and game rules](character-management-extension.md), [Character Details](character-details.md) |
| Inventory and planning | [Inventory management](inventory-management.md), [farming planner](farming-planner.md), [teams](teams.md) |
| Events | [Event tracking and calendar](event-tracking.md), [shared story events](shared-story-events.md) |
| Story guides | [Navigation](story-navigation.md), [header](story-guide-header.md), [dividers](story-dividers.md), [shared characters](shared-story-characters.md) |

## Evidence and outstanding repairs

- [November 21 parser validation](parser-validation-2026-11-21.md) preserves live-run findings, data-preservation checks and known coverage gaps. Use the parser guide for current commands and date semantics.
- [Genshin broken-image inventory](genshin-story-broken-images-2026-11-21.csv) retains actionable missing/renamed asset references. Recheck each record against current storage before applying a repair; database-managed image files must not be deleted based only on source-code reference searches.
