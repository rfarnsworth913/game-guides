# Character progression contracts and game rules

This guide documents shared contracts, read APIs, configurable progression profiles and the Game Rules editor. See [Character management](character-management.md) for catalog/collection use and [Character Details](character-details.md) for personal progression, resources, equipment and material calculations.

No production characters, numerical presets, or upgrade recipes were seeded. No live database migration was run. Game-specific fixtures in the tests use synthetic limits; they must not be copied into production as verified game data.

## Existing storage remains authoritative

| Responsibility | Storage / contract |
| --- | --- |
| Character identity and game | Existing shared catalog entry `id`, `game`, `name`, `rarity`, `notes`, `icon`, and `characterInformation` artwork/attribution |
| Extended shared metadata | Optional fields on `characterDefinition`: `schemaVersion: 2`, `attributes`, `abilities`, `resources`, `progressionProfileId`, `progressionOverrides` |
| Game-wide definitions | Optional `characterRules.attributes`, `resourceCategories`, `progressionProfiles` on the existing game document |
| Account progress | Existing player-progress record keyed by `gameId/characterId`, under `characterCollection` |
| New account fields | Optional `favorite`, `trackValues`, and `nodeStates`; independent goal values live in the existing `target` object |

No parallel characters, userCharacters, or progression collections were added. The existing unique game document and account progress record, stable per-game character IDs, and revision-conflict handling continue to provide persistence and isolation. Nested records reuse those boundaries. Inventory item references and internal Story Guide resource references are checked before catalog writes.

Shared writes still use editor-authorized `PUT /api/games/:game/catalog` with the existing revision and entries envelope. Account writes still use authenticated `PATCH /api/me/progress`. Guests retain local progress and the existing explicit account import flow. Neither public read projections nor progress updates can write shared definitions. Existing backups and catalog serialization preserve the optional fields without migration.

## Read APIs

| Route | Response |
| --- | --- |
| `GET /api/games/:game/characters` | `{ revision, total, offset, limit, characters }`; supports `search`, numeric `rarity`, `offset`, and `limit` (default 50, maximum 200) |
| `GET /api/games/:game/characters/:id` | `{ revision, character }` |
| `GET /api/games/:game/character-progression` | `{ revision, gameId, profiles, attributes, resourceCategories, legacyRules }` |
| `GET /api/games/:game/character-progression/:profileId` | `{ revision, profile }` |

Character reads return a versioned `CharacterCatalogRecord` projection: identity, classification, media URLs, abilities, resources, profile reference, and metadata. They omit ownership and personal progress. Existing guide links and character Story Guide placements are included as references without copying Story Guide rows. Resources already referencing a placement are not duplicated. Explicit ability definitions take precedence in this projection; legacy skills/passives remain stored and supply the fallback when abilities are absent.

`metadata.schemaVersion` describes the public projection; `metadata.sourceSchemaVersion` identifies preserved legacy or extended definitions. Old characters return `progressionProfileId: null` and continue using `legacyRules`. No synthetic profile assignment is persisted. The original numeric rarity representation remains supported; display labels can be supplied as registry attributes in a later UI increment.

Reads are public, respect the game's Character Management feature and archive state, return 404 for missing records, and validate pagination/filter input. New paths are read-only. Proposed CRUD and account-specific endpoint aliases are deliberately deferred: existing revision-aware catalog and account APIs already perform those writes.

## Progression contract

Profiles are identified within one game and contain ordered tracks. Supported track types are level, ascension, skill, unlock, enhancement, equipment, and custom. Numeric tracks have configured bounds or discrete allowed values. Unlock tracks use typed `{ unlocked: boolean }` node states rather than numeric counters.

Existing fields remain the only source of existing progression:

- Level tracks default to the collection's existing `level` field.
- Ascension tracks default to `ascensionRank`.
- Explicit `storage` bindings can point to `level`, `ascensionRank`, `skillLevels` with a stable skill key, or `progression` with a stable legacy track key.
- Unbound numeric tracks use `trackValues[trackId]`.
- Unlock tracks use `nodeStates[trackId]`.
- A bound track cannot also have a `trackValues` copy. Current and target values are resolved from their respective state objects; omitted new target keys inherit current values.

`characterTrackProgress` exposes current, target, maximum, remaining, and reached state for future configuration-driven controls. Invested values are stored; temporary/equipment bonuses are not added to them. A future effective-stat calculator must remain derived and separate.

Profiles validate unique IDs, bounds, discrete levels, dependency references, attainable prerequisite values, and acyclic dependency graphs. Branching unlock DAGs are supported. Existing ascension-rank tables continue providing level-dependent caps and promotion gating; this increment does not invent a new conditional dependency language or replace those gates.

Character-specific `progressionOverrides` replace existing track rules by stable ID. Overrides cannot add undeclared tracks, break dependencies, or reference unknown abilities. Ability definitions may be descriptive/fixed without a progression reference. Upgrade costs describe explicit transitions and positive safe-integer material quantities; all item IDs must exist in the game's inventory catalog. These costs are a contract for later farming integration, not a new material optimization engine.

The same validators run for shared catalog and account writes. Current/target constraints and dependencies apply to both owned characters and unowned plans. Removing ownership does not discard a plan. Targets cannot be below current invested progression. New malformed, negative, unknown, or out-of-cap values are rejected.

When profile definitions change, unchanged obsolete/new-track values remain stored. Backend validation permits unrelated personal edits without deleting that history, while changed invalid values and changes that break dependent tracks are rejected. `characterProgressIssues` without a previous state reports issues for review. Existing legacy level/gear/skill validation remains in force. No automatic remapping or clamping is performed.

## Attributes and resources

Attribute definitions provide labels, text/number/boolean/single-select/multi-select types, display order, filterability, searchability, card/detail visibility, and optional required-value validation. Known attributes are validated against the registry. Safe unknown attributes are retained for fallback rendering.

Resources have stable IDs, category, title, source kind, optional creator/language/tags/official status, and sort order. External resources accept HTTP(S) URLs without credentials. Internal resources resolve to an existing Story Guide record in the same game. Categories remain extensible. The [Character Details guide](character-details.md) documents their current presentation.

## Validation coverage

- Genshin-shaped configuration: existing level/ascension/talent fields, ascension caps, independent duplicate-upgrade goals, and rejection of duplicate bound state.
- Star Rail-shaped configuration: independently tracked branching unlocks, prerequisite enforcement, typed node validation, and cyclic-graph rejection.
- Fate/Grand Order-shaped configuration: discrete enhancements, larger invested counters, unowned planning, character-specific exceptions, and validated material costs.
- The same contract accepts all eight requested game identities without dedicated validators or unverified presets. Games not currently present in the registry can use the existing editor-managed game configuration; this increment does not automatically add them.
- Public API filtering/pagination, feature gates, missing records, account/shared data separation, schema round trips, resource references, dependency validation through the real progress service, and unchanged historical values.

## Configuration boundaries

Review actual game mechanics before assigning attributes, profiles or upgrade recipes. The editor does not install verified game presets, and synthetic test fixtures must not become production defaults. Existing unknown/retired values must remain visible and preserved. Advanced optimization remains outside this contract.

## Character Game Rules editor

Editors open **Characters → Manage → Game rules**. The dialog directly reuses the Story Guide shell, two-pane layout and sidebar styles. Desktop content scrolls independently of its persistent footer; narrow screens use the Story Guide navigation layout. Story Guide rendering is unchanged.

- **General:** read-only game identity, optional configuration version/description and a default profile. Versions are text labels (up to 64 characters), preserving values such as `1.6`, `1.10` and `1.6.1`; older numeric versions remain supported. Clearing the field removes the optional version. Characters with an explicit profile retain it; otherwise the default is resolved consistently by validation, inventory and the public character API.
- **Attributes:** inline expandable definitions, stable identifiers, all five input types, allowed values, ordering with drag handles and keyboard-accessible move buttons, search/filter/card/detail flags and required values. Existing rarity, weapon, damage and role settings remain available.
- **Progression:** profiles with numeric, discrete and independent unlock tracks, optional ability references and ordering. Existing storage bindings are retained. Legacy equipment slots, ascension gates and numeric tracks remain editable in an expandable section.
- **Dependencies:** same-profile track lookup and thresholds; saves reject missing references, unattainable values and cycles.
- **Upgrade Costs:** explicit transitions, existing same-game inventory material selectors and positive integer quantities. Duplicate transitions/materials and invalid references are rejected.
- **Display Rules:** attribute card/detail visibility is functional and uses the shared layout. Ordering comes from Attributes. Additional card indicator switches, track-specific visibility/target controls and detail-section expansion defaults are intentionally deferred rather than shown as nonfunctional controls.

Changes live in a working copy. Tab switches and failed saves retain edits. Cancel/close/Escape prompt before discarding a changed draft. Busy saves disable editing. Saves use the existing editor-authorized, revision-checked catalog endpoint; no account values are stored in shared rules.

Compatibility checks run in the UI and MongoDB repository. They conservatively reject removing published attributes/options/profiles/tracks, changing attribute or progression types/storage, narrowing progression/equipment limits, removing ascension ranks, altering prerequisites, or changing an existing default profile. A separate reviewed migration is required because other accounts may hold values not loaded in the editor. Labels, ordering, presentation flags and additive options remain editable. Catalog validation also rejects configurations that invalidate shared character definitions. No migration, account truncation, live database rewrite or game presets are performed by opening this dialog.

An initial configuration can set a default profile before first publication. Adding or replacing a default on an already configured game requires migration; the editor does not guess how to reinterpret existing accounts. The shared character editor now supports profile assignment and custom attribute values, and the reusable [Character Details planner](character-details.md) consumes numeric/unlock tracks, overrides, resources, inventory equipment copies and configured upgrade costs.
