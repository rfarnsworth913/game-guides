# Code organization

Shared declarations live in `projects/lib`; shared runtime behavior lives in `projects/common`.

```text
projects/
  lib/
    constants/     Date formats, game registry, public Auth0 settings, story labels
    enums/         Event and story tracking enums
    types/         Shared data models, interfaces, and type aliases
  common/
    characters/    Character defaults, validation, and game-rule checks
    farming/       Recipe validation, material calculations, and reset schedules
    images/        Shared image helpers
    player/        Player progress validation and team helpers
    quests/        Quest adapters, story validation, tracking, and display helpers
    workspace/     Catalog conversion, validation, backup parsing, and migrations
```

## Library declarations

- Use `lib/constants/*.constants.ts` for shared values such as `GAMES`, `DATE_FORMAT`, and `AUTH0_PUBLIC`. Function factories such as `emptyPatchOverview()` belong in `common`, even when declared with `const`.
- Use `lib/enums/*.enum.ts` for enums. Enum names and members use PascalCase.
- Use `lib/types/*.type.ts` for shared types and interfaces. Group declarations by domain and use PascalCase names, such as `CharacterRules`, `StoryTableRow`, and `ProgressSnapshot`.
- Each folder has an `index.ts` barrel. The types barrel uses type-only exports, and type dependencies use `import type` so models do not introduce runtime imports.
- `lib` may reference its own declarations and external library types; it must not depend on runtime functions in `common`, Angular components, or middleware services. Credentials and private settings do not belong here. `AUTH0_PUBLIC` contains public SDK settings only.

## Shared behavior

Keep cross-application functions and validators in the appropriate `common` domain folder. Functions import their data contracts and constants from `lib`. Do not add compatibility copies of types to runtime modules; import the declaration from its canonical location.

Keep implementation-private types beside their code until they are shared. UI-only component types remain inside the Angular project, and server-only service types remain inside middleware. This split does not turn browser/server-specific code into shared code.

For example:

```ts
import type { StoryTableRow } from '../../lib/types/story-template.type';
import { StoryTrackingMode } from '../../lib/enums/story-tracking.enum';
import { worldQuestObjectives } from '../../common/quests/world-quest';
```

Relative paths depend on the importing file. The root TypeScript configuration provides `@lib/*` for `projects/lib/*` and `@common/*` for `projects/common/*`. The parser Vitest configuration supports these aliases. Angular application and test configurations inherit these paths instead of overriding them. The Angular application's `@models/*` alias points to its UI-only `src/app/models/*`; cross-application contracts remain in `projects/lib`.

## Project checks

Both shared folders have dedicated TypeScript and lint configurations. `npm run lint:ci` includes both, with `lib:lint` and `common:lint` available separately. Type-aware rules remain enabled; existing lint policy and formatting findings are tracked separately.

Run `npm test`, `npm run ui:build`, and `npm run ui:e2e` after changes affecting shared contracts or runtime code. Moving files does not require a database migration: stored shapes, IDs, and values remain the same.

## Angular application

The Angular app follows feature ownership under `projects/guides-app/src/app`:

```text
core/
  auth/                      Auth0-backed account state
  state/                     Shared catalog/account synchronization and merge handling
  theme/                     Global theme service and preferences
shared/
  components/                Back-to-top, image selector and shared controls
  directives/                Dialog focus handling
  pipes/                     Safe Markdown rendering
models/types/                UI-only theme types; imported with @models/*
games/registry/              Game-specific presentation configuration
features/
  global/
    accounts/                Account dropdown, profile, and data actions
    dashboard/               Dashboard, game collection, and their shared read model
    settings/                Appearance and backup import/export
  gacha/
    achievements/
    characters/
    events/
    farming/
    inventory/
    progression/
    story-guide/
    teams/
    shared/components/       Domain UI such as material tiles and patch badges
layouts/
  main-layout/               Active workspace shell, navigation, and common entry editor
```

Feature components, templates, styles, local state, utilities, models, and tests stay together. Larger features such as story guides separate their page, template components, utilities, and position state. Smaller features do not need empty service/model folders.

The active shell composes pages; dashboard, game collection, settings, and progression are standalone feature components. Major views are loaded through Angular deferred blocks only when selected. Game routes keep the shell mounted when changing story sections. The unused alternate game layout and placeholder overview have been removed; game dashboards use the maintained dashboard feature.

`core/state/WorkspaceStore` coordinates the shared catalog and account-progress lifecycle across features. Feature-specific view state and preferences stay in the feature, rather than moving every service into core. The repository-level `projects/common` and `projects/lib` split is unchanged; Angular-specific UI declarations belong in app models or their owning feature.

No empty traditional-game features, game adapters, guards, or interceptors were introduced. Add them when there is real behavior to own. Current game mechanics remain shared data-driven rules from the API, without duplicating a planner for each game.

Global SCSS now lives in `projects/guides-app/src/styles`, with the Angular build pointing to that entry. Component styles stay beside components. Uploaded assets keep their existing `src/assets/<game>/` storage paths and API URLs: reorganizing code does not require rewriting stored image URLs or moving database-managed uploads.

The same test commands continue to work. Browser integration additionally checks dashboard, game collection, settings, progression, and every main game-feature route after deferred loading. Hosted-provider login remains outside the isolated test harness.


## Middleware

Middleware is organized into `src/app`, `src/config`, `src/core`, and domain-specific `src/modules`, with HTTP integration tests in `src/tests/integration` and helpers in `src/tests/helpers`. Operational launchers and migrations live in `projects/middleware/scripts`; the disposable browser harness remains in `projects/middleware/e2e`. See the [middleware architecture](../projects/middleware/README.md#middleware-architecture) for ownership, moved files, commands, and deferred work.

## Enforced boundaries and current implementation

- `tooling/eslint/project-boundaries.mjs` resolves aliases and relative imports. It rejects application dependencies from `lib`/`common`, browser/server implementation imports, and production imports of deprecated parser implementations retained for regression tests. `npm run tooling:test` verifies the restrictions.
- Current source imports use `@lib/*` and `@common/*`; the unused `@shared-lib/*` alias has been removed. Native filesystem paths are not import aliases.
- `CatalogEntry` is a discriminated union of character, event, story, inventory and other catalog records. `PlayerState` is an independent account contract. Legacy combined editor projections remain behind explicitly labeled conversion/decoding adapters; stored IDs and the flat database/API format have not changed.
- `WorkspaceStore` remains the public facade. `core/state/services/` owns request handling, catalog validation/concurrency, account-progress retries, validated guest storage, and detached character/inventory/team edit operations. Feature components continue using the existing store interface.
- Sidebar navigation styles live beside the sidebar. Shell headers and navigation use explicit classes, and story section heading geometry uses a shared Sass mixin. Remaining global workspace feature rules are marked legacy compatibility styles.
- Production parsers enter through `src/main.ts` → `sync/runner.ts`. `source-adapters.ts` owns source dispatch/extraction, `game-sync.ts` coordinates scheduling and import outcomes, and `legacy/parsers/` retains deprecated implementations with regression tests.
- Parser configurations use stable `gameId`; legacy name-only configurations are still readable. Configuration validation accepts `unknown`, compiles its schema once, and reports field paths. Database connections are explicitly opened/closed by the runner, never started by constructors.
- The runner writes atomic report checkpoints after each processed game. `complete: false` and `success: false` identify unfinished runs; final reports explicitly distinguish completion from success. Reports may include successful imports alongside source errors.
- `event-schedules.constants.ts` owns configured fixed server offsets/reset hours used to generate recurring periods. Date-only event dates display on their labeled local days, from 00:00 through 23:59, so balancing cannot postpone a daily task past midnight. `eventSchedule` remains source metadata; explicit timestamp dates retain their exact absolute deadlines.
- `npm test` now includes middleware and parser TypeScript checks, architectural tooling tests, middleware tests, Angular tests and parser tests. CI still separately runs lint, production builds, parser browser fixtures and isolated browser integration. No production database or live wiki scraping is required by the normal test gate.

See [legacy-code.md](legacy-code.md) for retained compatibility code and removal conditions. Uploaded-image storage is unchanged by this refactor.
