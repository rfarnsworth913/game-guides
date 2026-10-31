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

Relative paths depend on the importing file. The root TypeScript configuration also provides `@shared-lib/*` for `projects/lib/*` and `@common/*` for `projects/common/*`. Parser Jest mappings support both aliases. The Angular application's `@models/*` alias points to its UI-only `src/app/models/*`; cross-application contracts remain in `projects/lib`.

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
  components/                Header, theme controls, back-to-top, image selector
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
    overview/
    progression/
    story-guide/
    teams/
    shared/components/       Domain UI such as material tiles and patch badges
layouts/
  main-layout/               Active workspace shell, navigation, and common entry editor
  game-layout/               Existing alternate gacha layout/sidebar components
```

Feature components, templates, styles, local state, utilities, models, and tests stay together. Larger features such as story guides separate their page, template components, utilities, and position state. Smaller features do not need empty service/model folders.

The active shell composes pages; dashboard, game collection, settings, and progression are standalone feature components. Major views are loaded through Angular deferred blocks only when selected. The existing route matcher remains in place so changing story sections keeps the shell mounted and preserves readable/legacy URLs. The older alternate game layout and overview remain available but are not the active shell.

`core/state/WorkspaceStore` coordinates the shared catalog and account-progress lifecycle across features. Feature-specific view state and preferences stay in the feature, rather than moving every service into core. The repository-level `projects/common` and `projects/lib` split is unchanged; Angular-specific UI declarations belong in app models or their owning feature.

No empty traditional-game features, game adapters, guards, or interceptors were introduced. Add them when there is real behavior to own. Current game mechanics remain shared data-driven rules from the API, without duplicating a planner for each game.

Global SCSS now lives in `projects/guides-app/src/styles`, with the Angular build pointing to that entry. Component styles stay beside components. Uploaded assets keep their existing `src/assets/<game>/` storage paths and API URLs: reorganizing code does not require rewriting stored image URLs or moving database-managed uploads.

The same test commands continue to work. Browser integration additionally checks dashboard, game collection, settings, progression, and every main game-feature route after deferred loading. Hosted-provider login remains outside the isolated test harness.


## Middleware

Middleware is organized into `src/app`, `src/config`, `src/core`, and domain-specific `src/modules`, with HTTP integration tests in `src/tests/integration` and helpers in `src/tests/helpers`. Operational launchers and migrations live in `projects/middleware/scripts`; the disposable browser harness remains in `projects/middleware/e2e`. See the [middleware architecture](../projects/middleware/README.md#middleware-architecture) for ownership, moved files, commands, and deferred work.
