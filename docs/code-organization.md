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

Relative paths depend on the importing file. The root TypeScript configuration also provides `@shared-lib/*` for `projects/lib/*` and `@common/*` for `projects/common/*`. Parser Jest mappings support both aliases. The Angular application's existing `@lib/*` alias continues to mean its own `src/app/lib/*`; it is separate from the new shared library.

## Project checks

Both shared folders have dedicated TypeScript and lint configurations. `npm run lint:ci` includes both, with `lib:lint` and `common:lint` available separately. Type-aware rules remain enabled; existing lint policy and formatting findings are tracked separately.

Run `npm test`, `npm run ui:build`, and `npm run ui:e2e` after changes affecting shared contracts or runtime code. Moving files does not require a database migration: stored shapes, IDs, and values remain the same.
