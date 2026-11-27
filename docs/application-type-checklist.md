# Application type checklist

Inventory date: November 26, 2026. This is a review checklist of existing definitions, not a list of missing features. The six checked contracts from `games.type.ts` and the personal game-library contracts have been integrated into storage, validation, editors and workspace access. Other checkboxes remain open for the later domain-type review; they do not mean those types are unimplemented.

Original inventory scope: **157 named TypeScript type/interface/enum declarations** under `projects`: **150 application/tooling declarations** and **7 test-only declarations**. The navigation refactor adds six personal library contracts and one persistence alias, replacing the old browser-only `Preferences` alias. Counts include private aliases and repeated migration-local names, but not barrel re-exports. Classes, inferred anonymous shapes, generic parameters and external-library types are not counted as separate declarations.

Each entry describes its purpose, defining fields/options and named application contracts it depends on. Supporting module links identify the relevant defaults, enums, constants, validation or runtime helpers. These links describe relationships, not proof that every field is displayed by every UI. TypeScript declarations disappear at runtime; validators and API checks enforce stored/input data.

## How the main concepts fit together

- Game definitions: `GameDocument` holds `gameConfiguration` and `content`; `GameConfiguration` enables `GameFeature` modules with workspace visibility. `GameRegistration` pairs configuration with an ID for existing registry/editor consumers. `GameSnapshot` still carries the existing shared content projection.
- Shared versus personal: character/event/inventory definitions belong to the catalog. `PlayerState` and `ProgressSnapshot` hold account progress. `Entry` combines both for existing editor/UI code and is explicitly deprecated.
- Story guides: `StoryContentType` selects presentation; `PatchOverview` is the common payload, containing `StoryGroup`, `StoryTableRow` and `StoryContext`. The name `PatchOverview` does not limit it to patches.
- Characters: `CharacterDefinition` and `CharacterExtension` describe shared information; `CharacterRules` defines game-wide mechanics; `CharacterCollection` holds individual ownership/current/target progression.
- Events: parser `Event` and `Version` records feed the shared catalog; `EventCatalogEntry` is the application event record. Balance/calendar types represent derived scheduling and browser preferences.

## Content classifications to review

These are values within types rather than additional named TypeScript declarations. Game display terminology is defined by `GAME_STORY_NAMES`; saved template IDs remain stable.

- [ ] **Workspace kinds:** inventory, characters, teams, plans, story, events, achievements, achievement-category, story-category. Defined by `Kind`; compatibility array mapping is `LEGACY_CATALOG_FIELDS`.
- [ ] **Game features:** story, characters, teams, inventory, plans, events, farming, achievements. `GameFeature` defines the IDs; `GAME_FEATURES` supplies labels, explanations and icons.
- [ ] **Story templates:** character-information, divider, endgame-activity, events, lore, main-story, patch-overview, side-stories, world-quests. Defined by `STORY_CONTENT_TYPES`; conversion/preservation is handled by `template-conversion.ts` and `story-preservation.ts`.
- [ ] **World-quest groups:** region → Area Exploration; questChain → Quest Chain; collectionChecklist → Collection Checklist. Labels and suggestions live in `world-quest.constants.ts`; subtype suggestions are not an exhaustive enforced union.
- [ ] **Image categories:** banner, headshot, character (Splash Art), icon, landscape (Other). `IMAGE_CATEGORIES` defines labels, ratios and fit; `imageRecommendations` defines suggested upload sizes.
- [ ] **Character attributes:** string, number, boolean, enum, multi-select. `CharacterAttributeDefinition` supplies field schemas; selected values live in shared character attributes.
- [ ] **Progression tracks:** level, ascension, skill, unlock, enhancement, equipment, custom. `ProgressionTrackDefinition` supplies bounds, dependencies and costs.
- [ ] **Rows and groups:** rowType is quest/heading/note; groupType is quest/content. These organize presentation and tracking without creating a second completion record.

## Personal game-library contracts

Source: [game-library.type.ts](../projects/lib/types/game-library.type.ts). Supporting modules: [validation and navigation](../projects/common/workspace/game-library.ts), [account state](../projects/guides-app/src/app/core/state/game-navigation-preferences.ts), [repository](../projects/middleware/src/modules/game-library/game-library.repository.ts).

- [x] **GameLibraryView** — Names the all, favorites, pinned, recent, collection and editor management views.
- [x] **GameLibrarySort** — Name ascending/descending, recent use, recent addition, game type and manual ordering.
- [x] **GameLibraryPreferences** — Grid/list mode, sorting and collapsed sidebar sections.
- [x] **UserGamePreference** — Game ID, independent favorite/pin flags, last access time and last visited feature.
- [x] **UserGameCollection** — Stable collection ID, label, icon, ordered game membership and creation/update timestamps.
- [x] **UserGameLibrary** — Personal snapshot combining game preferences, pin order, collections, UI preferences and concurrency revision.
- [x] **LibraryDocument** — Middleware persistence alias adding the authenticated owner's MongoDB `_id` to `UserGameLibrary`; ownership never comes from submitted JSON.

## Shared library contracts (original inventory: 74)

### Dashboard read models (implemented)

Source: [dashboard.type.ts](../projects/lib/types/dashboard.type.ts). Supporting modules: [summary projections](../projects/common/dashboard/dashboard-summary.ts), [dashboard API](../projects/middleware/src/modules/dashboard/dashboard.routes.ts), [Angular data adapter](../projects/guides-app/src/app/features/global/dashboard/state/dashboard-data.ts).

- [x] **DashboardProgress** - Completed and eligible totals; zero eligible items render an unavailable state.
- [x] **DashboardLink** - A compact story/patch/activity navigation target with progress and an optional section/fragment.
- [x] **DashboardPlan** - Personal goal summary, optional existing character portrait and target label, and its existing character/planner destination.
- [x] **DashboardGame** - Personal progression update timestamp/history eligibility, feature-scoped game metadata and current version number, weighted progress and story-start state, goal-prioritized character portraits, achievement category totals, aggregate material sufficiency/calculation issues, goals and resource links. These optional additions remain derived API data.
- [x] **DashboardSummary** - Derived game summaries and per-game retrieval errors, with a generation timestamp.
- [x] **DashboardEvents** - Relevant calendar event definitions with canonical personal progress and per-game errors; uses the existing `Entry` compatibility projection for calendar interoperability.

These contracts are read models, not new database collections. `StoryPosition` also has a pure shared declaration in `common/dashboard/story-dashboard.ts` so server projections do not import Angular services.

### [character-display.type.ts](../projects/lib/types/character-display.type.ts)

Source: `projects/lib/types/character-display.type.ts`.

Supporting modules: [characters.ts](../projects/common/characters/characters.ts), [character-extension.ts](../projects/common/characters/character-extension.ts), [character-progression.ts](../projects/common/characters/character-progression.ts), [character-equipment.ts](../projects/common/characters/character-equipment.ts), [character-catalog.ts](../projects/common/characters/character-catalog.ts), [character-story.ts](../projects/common/characters/character-story.ts).

- [ ] **CharacterCardViewModel** (type) — Derived character inventory/card presentation with search attributes, ownership and progression summaries.
  Fields: `entry`, `characterId`, `gameId`, `name`, `headshotUrl`, `rarity`, `rarityLabel`, `attributes`, `attributeValues`, `searchText`, `owned`, `planned`, `favorite`, `hasGoal`, `unfinished`, `currentLevel?`, `targetLevel?`, `maximumLevel?`, `progressionPercent?`. Related contracts: `Entry`.

### [character-extension.type.ts](../projects/lib/types/character-extension.type.ts)

Source: `projects/lib/types/character-extension.type.ts`.

Supporting modules: [characters.ts](../projects/common/characters/characters.ts), [character-extension.ts](../projects/common/characters/character-extension.ts), [character-progression.ts](../projects/common/characters/character-progression.ts), [character-equipment.ts](../projects/common/characters/character-equipment.ts), [character-catalog.ts](../projects/common/characters/character-catalog.ts), [character-story.ts](../projects/common/characters/character-story.ts).

- [ ] **CharacterAttributeDefinition** (type) — Editor-defined attribute schema with value type, options, display order, filtering and visibility rules.
  Fields: `id`, `label`, `type`, `options?`, `displayOrder`, `filterable`, `visibleInHeader`, `searchable?`, `visibleInDetails?`, `required?`.

- [ ] **CharacterResource** (type) — Categorized external or internal character resource with attribution and display metadata.
  Fields: `id`, `category`, `title`, `sourceType`, `url?`, `contentId?`, `description?`, `creator?`, `language?`, `tags?`, `isOfficial?`, `sortOrder?`.

- [ ] **CharacterAbility** (type) — Extended ability definition with optional icon, source, progression track and unlock requirements.
  Fields: `id`, `name`, `category`, `description?`, `icon?`, `sourceUrl?`, `progressionTrackId?`, `unlockRequirements?`.

- [ ] **ProgressionDependency** (type) — Required value on another progression track before an upgrade is allowed.
  Fields: `trackId`, `requiredValue`.

- [ ] **UpgradeCost** (type) — Material quantities for a specific transition between progression values.
  Fields: `fromValue`, `toValue`, `materials`.

- [ ] **ProgressionTrackDefinition** (type) — Configurable leveling/unlock/upgrade track with bounds, dependencies, costs and optional binding to existing progress fields.
  Fields: `id`, `label`, `type`, `minValue?`, `maxValue?`, `levels?`, `displayOrder`, `abilityId?`, `dependencies?`, `upgradeCosts?`, `storage?`. Related contracts: `ProgressionDependency`, `UpgradeCost`.

- [ ] **CharacterProgressionProfile** (type) — Named per-game set of progression tracks assignable to characters.
  Fields: `id`, `gameId`, `tracks`. Related contracts: `ProgressionTrackDefinition`.

- [ ] **CharacterNodeState** (type) — Personal unlocked state of a progression node.
  Fields: `unlocked`.

- [ ] **CharacterExtension** (type) — Additive shared character metadata: artwork, attributes, abilities, resources and progression configuration.
  Fields: `headshot?`, `banner?`, `alternateNames?`, `schemaVersion?`, `attributes?`, `abilities?`, `resources?`, `progressionProfileId?`, `progressionOverrides?`. Related contracts: `CharacterAbility`, `CharacterResource`, `ProgressionTrackDefinition`.

- [ ] **CharacterCatalogRecord** (type) — Normalized schema-v2 character read model combining identity, classification, media and progression references; not a claim that the database has already migrated to this shape.
  Fields: `id`, `gameId`, `identity`, `classification`, `media`, `abilities`, `resources`, `progressionProfileId`, `progressionOverrides?`, `metadata`. Related contracts: `CharacterAbility`, `CharacterResource`, `ProgressionTrackDefinition`.

### [character.type.ts](../projects/lib/types/character.type.ts)

Source: `projects/lib/types/character.type.ts`.

Supporting modules: [characters.ts](../projects/common/characters/characters.ts), [character-extension.ts](../projects/common/characters/character-extension.ts), [character-progression.ts](../projects/common/characters/character-progression.ts), [character-equipment.ts](../projects/common/characters/character-equipment.ts), [character-catalog.ts](../projects/common/characters/character-catalog.ts), [character-story.ts](../projects/common/characters/character-story.ts).

- [ ] **CharacterSkill** (type) — Basic shared skill/passive definition with an optional maximum level.
  Fields: `id?`, `name`, `description`, `maxLevel?`.

- [ ] **AscensionRank** (type) — Level and skill caps associated with a promotion rank.
  Fields: `levelCap`, `skillLevelCap`.

- [ ] **CharacterGuide** (type) — Named strategy/reference link attached to shared character information or a personal collection.
  Fields: `title`, `url`.

- [ ] **CharacterDefinition** (type) — Shared weapon type, damage type, roles, skills, passives, guides and optional upgrade recipes; extended by the newer character contracts.
  Fields: `recipes?`, `weaponType`, `damageType`, `roles`, `skills`, `passiveSkills`, `guides`. Related contracts: `CharacterExtension`, `UpgradeRecipe`, `CharacterSkill`, `CharacterGuide`.

- [ ] **CharacterRules** (type) — Game-wide configuration for character attributes, progression, equipment, rarities, inventory, farming and team limits.
  Fields: `inventory?`, `configurationVersion?`, `description?`, `defaultProgressionProfileId?`, `rarityLabels?`, `attributes?`, `resourceCategories?`, `progressionProfiles?`, `farming?`, `teamSize?`, `levelCap`, `ascensionRanks?`, `rarities`, `weaponTypes`, `damageTypes`, `roles`, `enhancementCategories?`, `equipmentSlots`, `progressionTracks`. Related contracts: `InventoryConfig`, `CharacterAttributeDefinition`, `CharacterProgressionProfile`, `FarmingConfig`, `AscensionRank`.

- [ ] **CharacterProgression** (type) — Invested current or target character/equipment progression, including levels, skills, gear and custom tracks.
  Fields: `trackValues?`, `nodeStates?`, `level`, `ascensionRank?`, `skillLevels?`, `gear`, `progression`. Related contracts: `CharacterNodeState`.

- [ ] **CharacterCollection** (type) — Personal ownership, favorite state, progression, goals, notes and personal guides for a character.
  Fields: `completedGoals?`, `favorite?`, `owned`, `target?`, `notes?`, `personalGuides?`. Related contracts: `CharacterProgression`, `CharacterGuide`.

### [data-collections.type.ts](../projects/lib/types/data-collections.type.ts)

Source: `projects/lib/types/data-collections.type.ts`.

Supporting modules: [event-dates.ts](../projects/common/events/event-dates.ts), [event-progress.ts](../projects/common/events/event-progress.ts), [event-schedules.constants.ts](../projects/lib/constants/event-schedules.constants.ts).

- [ ] **RootDocument** (type) — Open MongoDB parser document keyed by ObjectId and game name, preserving additional fields.
  Fields: `_id`, `name`.

- [ ] **Event** (type) — Parser event transfer shape with dates, URL, category and optional reset provenance; distinct from EventCatalogEntry and the browser DOM Event.
  Fields: `title`, `startDate`, `endDate`, `url`, `icon?`, `eventType`, `completed?`, `eventSchedule?`. Related contracts: `EventType`, `EventSchedule`.

- [ ] **Version** (type) — Parser version result containing title, optional numeric version, release date and source URL.
  Fields: `title`, `versionNumber?`, `releaseDate?`, `url`.

### [data-file.type.ts](../projects/lib/types/data-file.type.ts)

Source: `projects/lib/types/data-file.type.ts`.

Supporting modules: [schema-validator.ts](../projects/data-parser/src/services/schema-validator.ts), [game-profiles.ts](../projects/data-parser/src/sync/game-profiles.ts), [source-adapters.ts](../projects/data-parser/src/sync/source-adapters.ts), [recurring-events.ts](../projects/data-parser/src/sync/recurring-events.ts).

- [ ] **DataFile** (type) — Parser configuration selecting a game, source list and optional configuration. The display-name id is deprecated for matching in favor of gameId.
  Fields: `id`, `gameId?`, `sourceList`, `configuration?`. Related contracts: `DataSource`.

- [ ] **DataSource** (type) — Named upstream source URL used by parser configurations.
  Fields: `id`, `url`.

### [equipment.type.ts](../projects/lib/types/equipment.type.ts)

Source: `projects/lib/types/equipment.type.ts`.

Supporting modules: [characters.ts](../projects/common/characters/characters.ts), [character-extension.ts](../projects/common/characters/character-extension.ts), [character-progression.ts](../projects/common/characters/character-progression.ts), [character-equipment.ts](../projects/common/characters/character-equipment.ts), [character-catalog.ts](../projects/common/characters/character-catalog.ts), [character-story.ts](../projects/common/characters/character-story.ts).

- [ ] **EquipmentStat** (type) — Named equipment stat and its display value.
  Fields: `name`, `value`.

- [ ] **EquipmentDefinition** (type) — Shared equipment classification, progression, stats and set bonuses.
  Fields: `typeId`, `weaponType?`, `progressionTracks?`, `stats?`, `setId?`, `setBonuses?`. Related contracts: `ProgressionTrackDefinition`, `EquipmentStat`.

- [ ] **EquipmentInstance** (type) — One personal owned equipment copy with its own progression, target and rolled stats; equipping does not remove the inventory copy.
  Fields: `id`, `current`, `target?`, `mainStat?`, `substats?`. Related contracts: `CharacterProgression`, `EquipmentStat`.

### [event-schedule.type.ts](../projects/lib/types/event-schedule.type.ts)

Source: `projects/lib/types/event-schedule.type.ts`.

Supporting modules: [event-dates.ts](../projects/common/events/event-dates.ts), [event-progress.ts](../projects/common/events/event-progress.ts), [event-schedules.constants.ts](../projects/lib/constants/event-schedules.constants.ts).

- [ ] **EventSchedule** (type) — Server reset-clock provenance used to interpret calendar task boundaries correctly.
  Fields: `offsetMinutes`, `resetHour`.

### [farming-config.type.ts](../projects/lib/types/farming-config.type.ts)

Source: `projects/lib/types/farming-config.type.ts`.

Supporting modules: [farming.ts](../projects/common/farming/farming.ts), [farming-config.ts](../projects/common/farming/farming-config.ts).

- [ ] **MaterialCost** (type) — Quantity of a material needed by an upgrade recipe.
  Fields: `item`, `amount`.

- [ ] **UpgradeRecipe** (type) — Level, ascension, skill or progression transition and its material costs.
  Fields: `kind`, `key?`, `from`, `to`, `materials`. Related contracts: `MaterialCost`.

- [ ] **FarmingSource** (type) — Location/activity that yields specified materials, with days, URL and restrictions.
  Fields: `id`, `name`, `category`, `region`, `location`, `materialIds`, `days?`, `url`, `restrictions`.

- [ ] **FarmingServer** (type) — Named server time zone and reset clock for availability calculations.
  Fields: `id`, `name`, `timeZone`, `resetHour`, `resetMinute`.

- [ ] **FarmingConfig** (type) — Game-wide farming sources and servers.
  Fields: `sources`, `servers`. Related contracts: `FarmingSource`, `FarmingServer`.

### [farming.type.ts](../projects/lib/types/farming.type.ts)

Source: `projects/lib/types/farming.type.ts`.

Supporting modules: [farming.ts](../projects/common/farming/farming.ts), [farming-config.ts](../projects/common/farming/farming-config.ts).

- [ ] **CostIssue** (type) — Material-calculation problem associated with a character.
  Fields: `characterId`, `message`.

- [ ] **CharacterCost** (type) — Aggregated material costs and calculation issues for progression.
  Fields: `costs`, `issues`.

- [ ] **FarmingMaterial** (type) — Derived material shortage with character and plan attribution.
  Fields: `item`, `required`, `owned`, `missing`, `characters`, `plans`. Related contracts: `Entry`.

- [ ] **FarmingGroup** (type) — Materials grouped by a farming source, including unassigned sources.
  Fields: `id`, `source`, `materials`, `characters`. Related contracts: `FarmingSource`, `FarmingMaterial`.

### [game-image.type.ts](../projects/lib/types/game-image.type.ts)

Source: `projects/lib/types/game-image.type.ts`.

Supporting modules: [image-category.constants.ts](../projects/lib/constants/image-category.constants.ts), [image-recommendations.constants.ts](../projects/lib/constants/image-recommendations.constants.ts), [image-categories.ts](../projects/common/images/image-categories.ts).

- [ ] **ImageCategory** (type) — Image purpose key derived from IMAGE_CATEGORIES for library filtering and metadata.
  Derived from `IMAGE_CATEGORIES`.

- [ ] **ImageDetails** (type) — Reusable image metadata: names, purpose categories, tags, attribution and dimensions.
  Fields: `title?`, `category?`, `categories?`, `tags?`, `description?`, `sourceName?`, `sourceUrl?`, `width?`, `height?`. Related contracts: `ImageCategory`.

- [ ] **GameImage** (type) — Library asset response including URLs, metadata, dimensions, format, size and timestamps.
  Fields: `name`, `url`, `details?`, `thumbnailUrl?`, `width?`, `height?`, `format?`, `fileSize?`, `createdAt?`, `updatedAt?`. Related contracts: `ImageDetails`.

### [games.type.ts](../projects/lib/types/games.type.ts)

Source: `projects/lib/types/games.type.ts`.

Supporting modules: [game-overview.ts](../projects/common/workspace/game-overview.ts), [workspace.constants.ts](../projects/lib/constants/workspace.constants.ts).

- [x] **GameDocument** (type) — Top-level shared game contract: stable gameId, version, gameConfiguration and nested content arrays. Existing domain payloads remain unchanged for the later type cleanup.
  Fields: `gameId`, `version`, `gameConfiguration`, `content`. Related contracts: `Version`, `GameConfiguration`.

- [x] **GameConfiguration** (type) — Shared game presentation, genre, enabled feature map, configuration revision and public/editor workspace visibility; contains no archive flag or duplicate game ID.
  Fields: `name`, `short`, `subtitle`, `description`, `genres` (string array), `icon`, `banner`, `color`, `features`, `revision`, `visibility`; optional `createdAt`, `updatedAt`. Related contracts: `GameFeature`, `GameFeatureConfig`, `GameVisibility`. The former singular genre and search-alias fields are retired.

- [x] **GameFeatureConfig** (type) — Configuration for one enabled feature. Its feature ID must match the map key; visibility is public or editors. Missing map keys mean the feature is unused.
  Fields: `feature`, `visibility`. Related contracts: `GameFeature`, `GameVisibility`.

- [x] **GameVisibility** (type) — Public versus editor-only access to a game or feature workspace. Global shared catalog data remains public.
  Options: `public`, `editors`.

- [x] **GameFeature** (type) — Supported feature IDs used to enable game navigation and capabilities.
  Options: `story`, `characters`, `teams`, `inventory`, `plans`, `events`, `farming`, `achievements`.

- [x] **GameRegistration** (type) — Registry/editor/API projection pairing GameConfiguration with its immutable gameId; not a second database configuration.
  Fields: `gameId`. Related contracts: `GameConfiguration`.

### [inventory.type.ts](../projects/lib/types/inventory.type.ts)

Source: `projects/lib/types/inventory.type.ts`.

Supporting modules: [inventory-config.ts](../projects/common/inventory/inventory-config.ts), [inventory-requirements.ts](../projects/common/inventory/inventory-requirements.ts), [inventory-crafting.ts](../projects/common/inventory/inventory-crafting.ts).

- [ ] **InventoryCategory** (type) — Editor-defined inventory grouping with label, icon, order, optional parent and enabled state.
  Fields: `id`, `label`, `icon?`, `displayOrder`, `parentCategoryId?`, `enabled`.

- [ ] **InventoryRecipe** (type) — Shared crafting recipe with output, ingredients, currency costs and optional unlock references.
  Fields: `id`, `outputItemId`, `outputQuantity`, `ingredients`, `currencyCosts?`, `unlockContentIds?`, `enabled`.

- [ ] **InventoryConfig** (type) — Game-wide inventory categories, rarity colors and crafting recipes.
  Fields: `categories`, `rarities`, `recipes`. Related contracts: `InventoryCategory`, `InventoryRecipe`.

- [ ] **InventoryMetadata** (type) — Item search aliases, tags, category memberships and enabled state.
  Fields: `aliases`, `tags`, `categoryIds`, `enabled`.

- [ ] **CraftRequest** (type) — Requested batch quantity, chaining behavior and recipe choices for a crafting operation.
  Fields: `recipeId`, `quantity`, `chained`, `recipeChoices`.

### [player-progress.type.ts](../projects/lib/types/player-progress.type.ts)

Source: `projects/lib/types/player-progress.type.ts`.

Supporting modules: [workspace.ts](../projects/common/workspace/workspace.ts), [player-progress.ts](../projects/common/player/player-progress.ts).

- [ ] **ProgressSnapshot** (type) — Versioned account-progress response containing personal state indexed by record ID.
  Fields: `revision`, `state`. Related contracts: `PlayerState`.

### [story-content.type.ts](../projects/lib/types/story-content.type.ts)

Source: `projects/lib/types/story-content.type.ts`.

Supporting modules: [story-content.constants.ts](../projects/lib/constants/story-content.constants.ts), [story-template.ts](../projects/common/quests/story-template.ts), [story-guide.ts](../projects/common/quests/story-guide.ts), [world-quest.ts](../projects/common/quests/world-quest.ts).

- [ ] **StoryContentType** (type) — Stable guide-template ID derived from STORY_CONTENT_TYPES; game-specific labels do not change saved IDs.
  Derived from `STORY_CONTENT_TYPES`.

### [story-context.type.ts](../projects/lib/types/story-context.type.ts)

Source: `projects/lib/types/story-context.type.ts`.

Supporting modules: [story-content.constants.ts](../projects/lib/constants/story-content.constants.ts), [story-template.ts](../projects/common/quests/story-template.ts), [story-guide.ts](../projects/common/quests/story-guide.ts), [world-quest.ts](../projects/common/quests/world-quest.ts).

- [ ] **StoryContext** (type) — Optional quest/activity metadata, prerequisite state, requirement links and related content. Some retained compatibility fields are deliberately absent from newer editor forms.
  Fields: `trackingMode?`, `availability?`, `startDate?`, `endDate?`, `cycleId?`, `resetSchedule?`, `chapter?`, `region?`, `area?`, `chain?`, `subtype?`, `difficulty?`, `requirements?`, `prerequisites?`, `requirementsOperator?`, `relatedContentIds?`. Related contracts: `StoryTrackingMode`, `StoryAvailability`, `StoryRequirementType`.

### [story-group.type.ts](../projects/lib/types/story-group.type.ts)

Source: `projects/lib/types/story-group.type.ts`.

Supporting modules: [story-content.constants.ts](../projects/lib/constants/story-content.constants.ts), [story-template.ts](../projects/common/quests/story-template.ts), [story-guide.ts](../projects/common/quests/story-guide.ts), [world-quest.ts](../projects/common/quests/world-quest.ts).

- [ ] **StoryGroup** (type) — Ordered content group or overarching quest heading, with default patch, optional title link and objective memberships.
  Fields: `id`, `title`, `icon?`, `description?`, `contentUrl?`, `defaultPatch?`, `groupType?`, `worldQuestMode?`, `objectiveIds?`, `mainQuest?`. Related contracts: `WorldQuestGroupType`, `StoryTableRow`.

### [story-template.type.ts](../projects/lib/types/story-template.type.ts)

Source: `projects/lib/types/story-template.type.ts`.

Supporting modules: [story-content.constants.ts](../projects/lib/constants/story-content.constants.ts), [story-template.ts](../projects/common/quests/story-template.ts), [story-guide.ts](../projects/common/quests/story-guide.ts), [world-quest.ts](../projects/common/quests/world-quest.ts).

- [ ] **StoryTableRow** (type) — Quest, heading or note row with content, patch, notes, optional context and group membership. Retains older fields such as subQuest/notesRight for compatibility.
  Fields: `context?`, `id`, `subQuest?`, `optional?`, `rowType?`, `groupId?`, `contentUrl?`, `thumbnailUrl?`, `duration?`, `contentType`, `content`, `patch`, `notes`, `notesRight?`. Related contracts: `StoryContext`.

- [ ] **PatchOverview** (type) — Shared story-template payload used beyond patch overviews: images, attribution, summary, groups, rows and preserved template drafts.
  Fields: `preservedTemplates?`, `title?`, `context?`, `imagePositionX?`, `imagePositionY?`, `characterName?`, `damageType?`, `damageTypeIcon?`, `faction?`, `factionIcon?`, `region?`, `subtitle?`, `versionImageUrl?`, `patchVersion?`, `patchTitle?`, `releaseDate?`, `summary?`, `groups?`, `imageUrl`, `imageAlt`, `sourceName`, `sourceUrl`, `rows`. Related contracts: `StoryContext`, `StoryGroup`, `StoryTableRow`.

### [team.type.ts](../projects/lib/types/team.type.ts)

Source: `projects/lib/types/team.type.ts`.

- [ ] **Team** (type) — Personal named team containing character IDs and notes.
  Fields: `id`, `name`, `members`, `notes`.

### [workspace.type.ts](../projects/lib/types/workspace.type.ts)

Source: `projects/lib/types/workspace.type.ts`.

Supporting modules: [workspace.ts](../projects/common/workspace/workspace.ts), [player-progress.ts](../projects/common/player/player-progress.ts).

- [ ] **Kind** (type) — Discriminates workspace record kinds, including category records; drives catalog conversion and feature editors.
  Options: `inventory`, `characters`, `teams`, `plans`, `story`, `events`, `achievements`, `achievement-category`, `story-category`.

- [ ] **Entry** (type) — Deprecated combined catalog/player editor view. Still used extensively by UI projections; do not treat it as the preferred shared persistence contract.
  Fields: `inventoryMetadata?`, `equipmentDefinition?`, `equipmentInstances?`, `region?`, `maxStack?`, `startDate?`, `endDate?`, `eventType?`, `eventSchedule?`, `characterDefinition?`, `characterCollection?`, `patchOverview?`, `mainStory?`, `sideStories?`, `eventStory?`, `worldQuests?`, `lore?`, `characterInformation?`, `storyContent?`, `removedPreservedFields?`, `characterId?`, `eventId?`, `storyRowCompletion?`, `storySection?`, `icon?`, `sectionImageUrl?`, `wikiUrl?`, `reward?`, `rewardIcon?`, `description?`, `requirementText?`, `id`, `game`, `kind`, `name`, `notes`, `quantity`, `target`, `category`, `rarity`, `members`, `requirements`, `completed`, `order`, `day`. Related contracts: `InventoryMetadata`, `EquipmentDefinition`, `EquipmentInstance`, `EventSchedule`, `CharacterDefinition`, `CharacterCollection`, `PatchOverview`, `Kind`.

- [ ] **PlayerState** (type) — Personal completion, quantities, targets, character collections, owned equipment and teams; kept separate from shared definitions.
  Fields: `completed`, `quantity`, `target`, `storyRowCompletion?`, `characterCollection?`, `equipmentInstances?`, `teams?`. Related contracts: `CharacterCollection`, `EquipmentInstance`, `Team`.

- [ ] **LegacyCatalogEntry** (type) — Deprecated flat shared-data compatibility shape used by adapters and editor projections.
  Related contracts: `Entry`, `PlayerState`.

- [ ] **DomainField** (type) — Private list of domain-specific fields used to constrain each catalog variant.
  Options: `characterDefinition`, `characterInformation`, `inventoryMetadata`, `equipmentDefinition`, `maxStack`, `patchOverview`, `mainStory`, `sideStories`, `eventStory`, `worldQuests`, `lore`, `characterId`, `eventId`.

- [ ] **CatalogFields** (type) — Private shared catalog fields with personal state, the discriminator and domain-specific fields omitted.
  Related contracts: `Entry`, `PlayerState`, `DomainField`.

- [ ] **DomainFields** (type) — Private generic helper allowing a catalog variant only its permitted domain fields.
  Related contracts: `DomainField`, `Entry`.

- [ ] **CharacterCatalogEntry** (type) — Shared character catalog variant containing character definition and story information.
  Fields: `kind`. Related contracts: `CatalogFields`, `DomainFields`.

- [ ] **EventCatalogEntry** (type) — Shared event catalog variant containing the canonical event story/objectives.
  Fields: `kind`. Related contracts: `CatalogFields`, `DomainFields`.

- [ ] **StoryCatalogEntry** (type) — Shared guide placement, template data and optional references to canonical characters/events.
  Fields: `kind`. Related contracts: `CatalogFields`, `DomainFields`.

- [ ] **InventoryCatalogEntry** (type) — Shared material/equipment catalog variant with inventory metadata and equipment definitions.
  Fields: `kind`. Related contracts: `CatalogFields`, `DomainFields`.

- [ ] **OtherCatalogEntry** (type) — Private mapped union covering teams, plans, achievements and category records through their kind discriminator.
  Related contracts: `Kind`, `CatalogFields`, `DomainFields`.

- [ ] **CatalogEntry** (type) — Discriminated union for shared catalog records exchanged and validated independently of player state.
  Related contracts: `CharacterCatalogEntry`, `EventCatalogEntry`, `StoryCatalogEntry`, `InventoryCatalogEntry`, `OtherCatalogEntry`.

- [ ] **GameSnapshot** (type) — Versioned per-game catalog response, including entries, optional character rules and game overview.
  Fields: `id`, `name`, `revision`, `entries`, `characterRules?`, `overview?`. Related contracts: `CatalogEntry`, `CharacterRules`, `GameRegistration`.

### [world-quest.type.ts](../projects/lib/types/world-quest.type.ts)

Source: `projects/lib/types/world-quest.type.ts`.

Supporting modules: [story-content.constants.ts](../projects/lib/constants/story-content.constants.ts), [story-template.ts](../projects/common/quests/story-template.ts), [story-guide.ts](../projects/common/quests/story-guide.ts), [world-quest.ts](../projects/common/quests/world-quest.ts).

- [ ] **WorldQuestGroupType** (type) — World-quest organization mode determining the grouping label/icon: area exploration, quest chain or collection checklist.
  Options: `region`, `questChain`, `collectionChecklist`.

- [ ] **WorldQuestSection** (type) — Derived world-quest subsection with optional linked heading and objective rows.
  Fields: `id`, `title`, `heading?`, `rows`. Related contracts: `StoryTableRow`.

- [ ] **WorldQuestGroup** (type) — Derived world-quest group containing its organization mode, sections and canonical rows.
  Fields: `id`, `title`, `contentUrl?`, `mode`, `sections`, `rows`. Related contracts: `WorldQuestGroupType`, `WorldQuestSection`, `StoryTableRow`.

## Shared enums (4)

### [event-types.enum.ts](../projects/lib/enums/event-types.enum.ts)

Source: `projects/lib/enums/event-types.enum.ts`.

Supporting modules: [event-dates.ts](../projects/common/events/event-dates.ts), [event-progress.ts](../projects/common/events/event-progress.ts), [event-schedules.constants.ts](../projects/lib/constants/event-schedules.constants.ts).

- [ ] **EventType** (enum) — Parser event classification covering banners, recurring tasks, endgame and other event sources.
  Values: `banner`, `battle-pass`, `crafting`, `daily`, `end-game`, `monthly`, `permanent`, `tcg`, `temporary`, `web`, `weekly`, `weekly-linked`.

### [story-tracking.enum.ts](../projects/lib/enums/story-tracking.enum.ts)

Source: `projects/lib/enums/story-tracking.enum.ts`.

Supporting modules: [story-content.constants.ts](../projects/lib/constants/story-content.constants.ts), [story-template.ts](../projects/common/quests/story-template.ts), [story-guide.ts](../projects/common/quests/story-guide.ts), [world-quest.ts](../projects/common/quests/world-quest.ts).

- [ ] **StoryTrackingMode** (enum) — Defines whether a row is completed, viewed, read, collected or recurring.
  Values: `completed`, `viewed`, `read`, `collected`, `recurring`.

- [ ] **StoryAvailability** (enum) — Retained availability classification for permanent, limited, recurring or retired content.
  Values: `permanent`, `limited`, `recurring`, `retired`.

- [ ] **StoryRequirementType** (enum) — Requirement/context classification, including prerequisite and advisory categories; not every category represents an access condition.
  Values: `prerequisite`, `unlock`, `time-gate`, `location`, `missable`, `spoiler`, `reward`, `recommendation`.

## Shared runtime helper contracts (5)

### [character-progression.ts](../projects/common/characters/character-progression.ts)

Source: `projects/common/characters/character-progression.ts`.

Supporting modules: [characters.ts](../projects/common/characters/characters.ts), [character-extension.ts](../projects/common/characters/character-extension.ts), [character-equipment.ts](../projects/common/characters/character-equipment.ts), [character-catalog.ts](../projects/common/characters/character-catalog.ts), [character-story.ts](../projects/common/characters/character-story.ts).

- [ ] **CharacterProgressIssue** (type) — Validation problem tied to a progression track and current/target state.
  Fields: `trackId`, `state`, `message`.

### [image-categories.ts](../projects/common/images/image-categories.ts)

Source: `projects/common/images/image-categories.ts`.

Supporting modules: [image-category.constants.ts](../projects/lib/constants/image-category.constants.ts), [image-recommendations.constants.ts](../projects/lib/constants/image-recommendations.constants.ts).

- [ ] **ImageUse** (type) — Detected reference to an image in game data, including its field path and content title.
  Fields: `filename`, `path`, `title`, `game`.

### [inventory-requirements.ts](../projects/common/inventory/inventory-requirements.ts)

Source: `projects/common/inventory/inventory-requirements.ts`.

Supporting modules: [inventory-config.ts](../projects/common/inventory/inventory-config.ts), [inventory-crafting.ts](../projects/common/inventory/inventory-crafting.ts).

- [ ] **MaterialUsage** (type) — An inventory demand source, its required quantity and associated characters.
  Fields: `id`, `name`, `quantity`, `characters`.

- [ ] **InventoryItemView** (type) — Derived inventory row combining the item, owned/required/missing amounts and usage breakdown.
  Fields: `item`, `owned`, `required`, `missing`, `usages`. Related contracts: `Entry`, `MaterialUsage`.

### [game-overview.ts](../projects/common/workspace/game-overview.ts)

Source: `projects/common/workspace/game-overview.ts`.

Supporting modules: [workspace.constants.ts](../projects/lib/constants/workspace.constants.ts).

- [ ] **GameOverviewField** (type) — Game editor field names used to associate validation errors with controls, including form-wide errors.
  Options: `id`, `name`, `short`, `description`, `genres`, `icon`, `banner`, `features`, `color`, `form`.

## Angular UI and browser state (23)

### [auth.store.ts](../projects/guides-app/src/app/core/auth/auth.store.ts)

Source: `projects/guides-app/src/app/core/auth/auth.store.ts`.

- [ ] **Account** (type) — Frontend signed-in account summary and editor flag.
  Fields: `id`, `name`, `editor`.

The former browser-only `Preferences` alias was replaced by `UserGameLibrary`, documented below. Existing browser favorites remain available for explicit import into an account.

### [guest-progress-storage.ts](../projects/guides-app/src/app/core/state/services/guest-progress-storage.ts)

Source: `projects/guides-app/src/app/core/state/services/guest-progress-storage.ts`.

- [ ] **State** (type) — Private map of entry IDs to guest PlayerState records.
  Related contracts: `PlayerState`.

### [character-details.ts](../projects/guides-app/src/app/features/gacha/characters/components/character-details/character-details.ts)

Source: `projects/guides-app/src/app/features/gacha/characters/components/character-details/character-details.ts`.

Supporting modules: [characters.ts](../projects/common/characters/characters.ts), [character-extension.ts](../projects/common/characters/character-extension.ts), [character-progression.ts](../projects/common/characters/character-progression.ts), [character-equipment.ts](../projects/common/characters/character-equipment.ts), [character-catalog.ts](../projects/common/characters/character-catalog.ts), [character-story.ts](../projects/common/characters/character-story.ts).

- [ ] **EquipmentCopy** (type) — Character Details pairing of a shared inventory entry and a specific owned equipment instance.
  Fields: `item`, `instance`. Related contracts: `Entry`, `EquipmentInstance`.

### [event-balance.ts](../projects/guides-app/src/app/features/gacha/events/utils/event-balance.ts)

Source: `projects/guides-app/src/app/features/gacha/events/utils/event-balance.ts`.

Supporting modules: [event-dates.ts](../projects/common/events/event-dates.ts), [event-progress.ts](../projects/common/events/event-progress.ts), [event-schedules.constants.ts](../projects/lib/constants/event-schedules.constants.ts).

- [ ] **Job** (type) — Private balancing candidate with permissible scheduling window and preferred day.
  Fields: `key`, `first`, `last`, `preferred`.

- [ ] **BalancedEvents** (type) — Computed daily assignments, unscheduled reasons, capacity, date window and optional conflicts.
  Fields: `assignments`, `unscheduled`, `dailyLimit`, `start`, `end`, `conflicts?`.

- [ ] **BalanceOptions** (type) — Optional daily capacity and manually pinned assignments supplied to the balancing algorithm.
  Fields: `maxPerDay?`, `pins?`.

### [event-calendar.ts](../projects/guides-app/src/app/features/gacha/events/utils/event-calendar.ts)

Source: `projects/guides-app/src/app/features/gacha/events/utils/event-calendar.ts`.

Supporting modules: [event-dates.ts](../projects/common/events/event-dates.ts), [event-progress.ts](../projects/common/events/event-progress.ts), [event-schedules.constants.ts](../projects/lib/constants/event-schedules.constants.ts).

- [ ] **EventDateRange** (type) — Supported calendar/list date windows, including today, week, month and year.
  Options: `all`, `today`, `week`, `next-7-days`, `month`, `next-month`, `year`.

### [event-list.ts](../projects/guides-app/src/app/features/gacha/events/utils/event-list.ts)

Source: `projects/guides-app/src/app/features/gacha/events/utils/event-list.ts`.

Supporting modules: [event-dates.ts](../projects/common/events/event-dates.ts), [event-progress.ts](../projects/common/events/event-progress.ts), [event-schedules.constants.ts](../projects/lib/constants/event-schedules.constants.ts).

- [ ] **EventGroupId** (type) — Display buckets for active, completed and ended events.
  Options: `active`, `completed`, `ended`.

### [event-schedule-preferences.ts](../projects/guides-app/src/app/features/gacha/events/utils/event-schedule-preferences.ts)

Source: `projects/guides-app/src/app/features/gacha/events/utils/event-schedule-preferences.ts`.

Supporting modules: [event-dates.ts](../projects/common/events/event-dates.ts), [event-progress.ts](../projects/common/events/event-progress.ts), [event-schedules.constants.ts](../projects/lib/constants/event-schedules.constants.ts).

- [ ] **EventSchedulePreferences** (type) — Saved scheduling pins, daily limit and compact-layout preference.
  Fields: `pins`, `maxPerDay`, `compact`.

### [event-view-preferences.ts](../projects/guides-app/src/app/features/gacha/events/utils/event-view-preferences.ts)

Source: `projects/guides-app/src/app/features/gacha/events/utils/event-view-preferences.ts`.

Supporting modules: [event-dates.ts](../projects/common/events/event-dates.ts), [event-progress.ts](../projects/common/events/event-progress.ts), [event-schedules.constants.ts](../projects/lib/constants/event-schedules.constants.ts).

- [ ] **EventViewPreferences** (type) — Saved event filters, date window, view, balancing, sorting and expanded/collapsed UI state.
  Fields: `view`, `selectedGame`, `groups`, `type`, `status`, `period`, `search`, `showCompleted`, `balanceEnabled`, `filtersOpen`, `month`, `backlogSort`, `settingsOpen`, `summaryFilter`, `collapsedGroups`, `listSort`. Related contracts: `EventDateRange`.

### [farming-preferences.ts](../projects/guides-app/src/app/features/gacha/farming/state/farming-preferences.ts)

Source: `projects/guides-app/src/app/features/gacha/farming/state/farming-preferences.ts`.

Supporting modules: [farming.ts](../projects/common/farming/farming.ts), [farming-config.ts](../projects/common/farming/farming-config.ts).

- [ ] **FarmingPreferences** (type) — Browser UI choices for selected goals, filters, server, sorting and farming view.
  Fields: `selected`, `includeOther`, `includeUnassigned`, `mode`, `category`, `region`, `rarity`, `missingOnly`, `ownedOnly`, `availableOnly`, `view`, `sort`, `server`.

### [story-position.store.ts](../projects/guides-app/src/app/features/gacha/story-guide/state/story-position.store.ts)

Source: `projects/guides-app/src/app/features/gacha/story-guide/state/story-position.store.ts`.

Supporting modules: [story-content.constants.ts](../projects/lib/constants/story-content.constants.ts), [story-template.ts](../projects/common/quests/story-template.ts), [story-guide.ts](../projects/common/quests/story-guide.ts), [world-quest.ts](../projects/common/quests/world-quest.ts).

- [ ] **StoryPosition** (type) — Per-game last-visited guide entry/row and timestamp used to resume reading.
  Fields: `entryId`, `rowId?`, `visitedAt`.

### [story-requirement-links.ts](../projects/guides-app/src/app/features/gacha/story-guide/utils/story-requirement-links.ts)

Source: `projects/guides-app/src/app/features/gacha/story-guide/utils/story-requirement-links.ts`.

Supporting modules: [story-content.constants.ts](../projects/lib/constants/story-content.constants.ts), [story-template.ts](../projects/common/quests/story-template.ts), [story-guide.ts](../projects/common/quests/story-guide.ts), [world-quest.ts](../projects/common/quests/world-quest.ts).

- [ ] **RequirementLink** (type) — Searchable quest/content-link result with its ID, title, context and destination.
  Fields: `id`, `name`, `detail`, `url`.

### [story-search.ts](../projects/guides-app/src/app/features/gacha/story-guide/utils/story-search.ts)

Source: `projects/guides-app/src/app/features/gacha/story-guide/utils/story-search.ts`.

Supporting modules: [story-content.constants.ts](../projects/lib/constants/story-content.constants.ts), [story-template.ts](../projects/common/quests/story-template.ts), [story-guide.ts](../projects/common/quests/story-guide.ts), [world-quest.ts](../projects/common/quests/world-quest.ts).

- [ ] **StorySearchResult** (type) — Live guide-search hit with section/row identity, location and matching text.
  Fields: `id`, `title`, `context`, `excerpt`, `sectionId`, `target`.

### [game-manager.ts](../projects/guides-app/src/app/layouts/main-layout/components/game-manager/game-manager.ts)

Source: `projects/guides-app/src/app/layouts/main-layout/components/game-manager/game-manager.ts`.

- [ ] **GameManagementRequest** (type) — Request to open game management for add, edit or list actions.
  Fields: `action`, `id?`.

- [ ] **EditorTab** (type) — Private game management tab selector for overview or advanced settings.
  Options: `overview`, `features`, `advanced`.

### [workspace-sidebar.ts](../projects/guides-app/src/app/layouts/main-layout/components/sidebar/workspace-sidebar.ts)

Source: `projects/guides-app/src/app/layouts/main-layout/components/sidebar/workspace-sidebar.ts`.

- [ ] **SidebarLink** (type) — Workspace/game navigation item with label, icon and optional separator.
  Fields: `id`, `label`, `icon`, `divider?`.

- [ ] **SidebarMode** (type) — Private sidebar mode selecting workspace navigation or game selection.
  Options: `workspace`, `game-selection`.

- [ ] **GameFilter** (type) — Private game-list filter for all, favorites or recently used games.
  Options: `all`, `favorites`, `recent`.

### [theme.type.ts](../projects/guides-app/src/app/models/types/theme.type.ts)

Source: `projects/guides-app/src/app/models/types/theme.type.ts`.

- [ ] **GlobalTheme** (type) — Application light/dark preference.
  Options: `light`, `dark`.

- [ ] **GameTheme** (type) — Supported game-specific presentation theme IDs and default theme.
  Options: `default`, `endfield`, `ffxiv`, `genshin`, `hsr`, `nte`, `wuwa`, `zzz`.

### [image-library.ts](../projects/guides-app/src/app/shared/components/image-selector/image-library.ts)

Source: `projects/guides-app/src/app/shared/components/image-selector/image-library.ts`.

Supporting modules: [image-category.constants.ts](../projects/lib/constants/image-category.constants.ts), [image-recommendations.constants.ts](../projects/lib/constants/image-recommendations.constants.ts), [image-categories.ts](../projects/common/images/image-categories.ts).

- [ ] **ImageSort** (type) — Available image-library ordering choices.
  Options: `name-asc`, `name-desc`, `newest`, `oldest`, `recent`.

## Parser pipeline (14)

### [browser-source.ts](../projects/data-parser/src/sync/browser-source.ts)

Source: `projects/data-parser/src/sync/browser-source.ts`.

Supporting modules: [schema-validator.ts](../projects/data-parser/src/services/schema-validator.ts), [game-profiles.ts](../projects/data-parser/src/sync/game-profiles.ts), [source-adapters.ts](../projects/data-parser/src/sync/source-adapters.ts), [recurring-events.ts](../projects/data-parser/src/sync/recurring-events.ts).

- [ ] **BrowserOptions** (type) — Optional scraper executable, diagnostics and source-snapshot output configuration.
  Fields: `diagnosticsDirectory?`, `snapshotsDirectory?`, `executablePath?`, `pause?`.

### [extract.ts](../projects/data-parser/src/sync/extract.ts)

Source: `projects/data-parser/src/sync/extract.ts`.

Supporting modules: [schema-validator.ts](../projects/data-parser/src/services/schema-validator.ts), [game-profiles.ts](../projects/data-parser/src/sync/game-profiles.ts), [source-adapters.ts](../projects/data-parser/src/sync/source-adapters.ts), [recurring-events.ts](../projects/data-parser/src/sync/recurring-events.ts).

- [ ] **EventExtraction** (type) — Dynamic event extraction result plus undated, recognized-table and skipped-row diagnostics.
  Fields: `events`, `undated`, `recognizedTables`, `skipped?`. Related contracts: `Event`, `SkippedRow`.

### [game-sync.ts](../projects/data-parser/src/sync/game-sync.ts)

Source: `projects/data-parser/src/sync/game-sync.ts`.

Supporting modules: [schema-validator.ts](../projects/data-parser/src/services/schema-validator.ts), [game-profiles.ts](../projects/data-parser/src/sync/game-profiles.ts), [source-adapters.ts](../projects/data-parser/src/sync/source-adapters.ts), [recurring-events.ts](../projects/data-parser/src/sync/recurring-events.ts).

- [ ] **Dependencies** (type) — Injected page reader, JSON reader and optional import service used by the game-sync orchestrator.
  Fields: `read`, `json`, `service?`. Related contracts: `SourcePage`, `ImportService`.

### [runner.ts](../projects/data-parser/src/sync/runner.ts)

Source: `projects/data-parser/src/sync/runner.ts`.

Supporting modules: [schema-validator.ts](../projects/data-parser/src/services/schema-validator.ts), [game-profiles.ts](../projects/data-parser/src/sync/game-profiles.ts), [source-adapters.ts](../projects/data-parser/src/sync/source-adapters.ts), [recurring-events.ts](../projects/data-parser/src/sync/recurring-events.ts).

- [ ] **Options** (type) — Parsed CLI options for games, dry run, month horizon, report path and browser/headless mode.
  Fields: `games`, `dryRun`, `months`, `now`, `report`, `headless`, `browser`.

### [source-adapters.ts](../projects/data-parser/src/sync/source-adapters.ts)

Source: `projects/data-parser/src/sync/source-adapters.ts`.

Supporting modules: [schema-validator.ts](../projects/data-parser/src/services/schema-validator.ts), [game-profiles.ts](../projects/data-parser/src/sync/game-profiles.ts), [recurring-events.ts](../projects/data-parser/src/sync/recurring-events.ts).

- [ ] **SourceDependencies** (type) — Injected page and JSON readers used by source-specific adapters.
  Fields: `read`, `json`. Related contracts: `SourcePage`.

### [types.ts](../projects/data-parser/src/sync/types.ts)

Source: `projects/data-parser/src/sync/types.ts`.

Supporting modules: [schema-validator.ts](../projects/data-parser/src/services/schema-validator.ts), [game-profiles.ts](../projects/data-parser/src/sync/game-profiles.ts), [source-adapters.ts](../projects/data-parser/src/sync/source-adapters.ts), [recurring-events.ts](../projects/data-parser/src/sync/recurring-events.ts).

- [ ] **Recurrence** (type) — Static daily/weekly/monthly activity rule used to generate future event instances.
  Fields: `title`, `url`, `cadence`, `day?`, `eventType`. Related contracts: `Event`.

- [ ] **GameProfile** (type) — Parser game identity, server reset offset/hour and recurrence definitions.
  Fields: `id`, `name`, `offsetMinutes`, `resetHour`, `recurring`. Related contracts: `Recurrence`.

- [ ] **Link** (type) — Extracted upstream anchor text, destination URL and title.
  Fields: `text`, `url`, `title`.

- [ ] **Cell** (type) — Extracted table-cell text and links.
  Fields: `text`, `links`. Related contracts: `Link`.

- [ ] **SourcePage** (type) — Browser-extracted upstream page containing text, links, sections and tables.
  Fields: `url`, `title`, `text`, `links`, `sections?`, `tables`. Related contracts: `Link`, `Cell`.

- [ ] **SkippedRow** (type) — Source row excluded from import, with its period and reason for diagnostics.
  Fields: `title`, `period`, `reason`.

- [ ] **SourceOutcome** (type) — Per-source success/failure, imported count, errors and skipped rows in a parser report.
  Fields: `id`, `url`, `status`, `count`, `error?`, `skipped?`. Related contracts: `SkippedRow`.

- [ ] **GameReport** (type) — Per-game parser result with version, events, recurring/dynamic counts and source outcomes.
  Fields: `game`, `name`, `status`, `version?`, `events?`, `recurring`, `dynamic`, `sources`, `errors`. Related contracts: `Version`, `Event`, `SourceOutcome`.

- [ ] **ImportService** (type) — Persistence contract for adding parsed events, updating a version and disconnecting.
  Fields: `addRecords`, `updateVersion`, `disconnect`. Related contracts: `Event`, `Version`.

## Middleware and migration tooling (30)

### [character-story-migration.ts](../projects/middleware/scripts/migrations/character-story-migration.ts)

Source: `projects/middleware/scripts/migrations/character-story-migration.ts`.

Supporting modules: [characters.ts](../projects/common/characters/characters.ts), [character-extension.ts](../projects/common/characters/character-extension.ts), [character-progression.ts](../projects/common/characters/character-progression.ts), [character-equipment.ts](../projects/common/characters/character-equipment.ts), [character-catalog.ts](../projects/common/characters/character-catalog.ts), [character-story.ts](../projects/common/characters/character-story.ts), [story-content.constants.ts](../projects/lib/constants/story-content.constants.ts), [story-template.ts](../projects/common/quests/story-template.ts), [story-guide.ts](../projects/common/quests/story-guide.ts), [world-quest.ts](../projects/common/quests/world-quest.ts).

- [ ] **Document** (type) — Private open database-document shape used by the owning adapter/migration to preserve unknown fields.
  Fields: `_id?`, `name?`, `_revision?`.

- [ ] **BackupCollection** (type) — Migration backup manifest entry with filename, count, checksum and indexes.
  Fields: `name`, `filename`, `count`, `sha256`, `indexes`. Related contracts: `Document`.

- [ ] **BackupManifest** (type) — Migration backup metadata describing database, catalog, timestamp and backed-up collections.
  Fields: `createdAt`, `database`, `catalog`, `collections`. Related contracts: `BackupCollection`.

### [event-story-migration.ts](../projects/middleware/scripts/migrations/event-story-migration.ts)

Source: `projects/middleware/scripts/migrations/event-story-migration.ts`.

Supporting modules: [story-content.constants.ts](../projects/lib/constants/story-content.constants.ts), [story-template.ts](../projects/common/quests/story-template.ts), [story-guide.ts](../projects/common/quests/story-guide.ts), [world-quest.ts](../projects/common/quests/world-quest.ts), [event-dates.ts](../projects/common/events/event-dates.ts), [event-progress.ts](../projects/common/events/event-progress.ts), [event-schedules.constants.ts](../projects/lib/constants/event-schedules.constants.ts).

- [ ] **Document** (type) — Private open database-document shape used by the owning adapter/migration to preserve unknown fields.
  Fields: `_id?`, `name?`, `_revision?`.

- [ ] **BackupCollection** (type) — Migration backup manifest entry with filename, count, checksum and indexes.
  Fields: `name`, `filename`, `count`, `sha256`, `indexes`. Related contracts: `Document`.

- [ ] **BackupManifest** (type) — Migration backup metadata describing database, catalog, timestamp and backed-up collections.
  Fields: `createdAt`, `database`, `catalog`, `collections`. Related contracts: `BackupCollection`.

### [main-quest-migration.ts](../projects/middleware/scripts/migrations/main-quest-migration.ts)

Source: `projects/middleware/scripts/migrations/main-quest-migration.ts`.

- [ ] **Document** (type) — Private open database-document shape used by the owning adapter/migration to preserve unknown fields.
  Fields: `_id?`, `name?`, `_revision?`.

- [ ] **BackupCollection** (type) — Migration backup manifest entry with filename, count, checksum and indexes.
  Fields: `name`, `filename`, `count`, `sha256`, `indexes`. Related contracts: `Document`.

- [ ] **BackupManifest** (type) — Migration backup metadata describing database, catalog, timestamp and backed-up collections.
  Fields: `createdAt`, `database`, `catalog`, `collections`. Related contracts: `BackupCollection`.

### [app.types.ts](../projects/middleware/src/app/app.types.ts)

Source: `projects/middleware/src/app/app.types.ts`.

- [ ] **CatalogRepository** (type) — API-facing catalog repository capabilities, with optional game management operations.

- [ ] **AccountProgressRepository** (type) — API-facing account progress read/patch repository contract.

- [ ] **ApiDependencies** (type) — Dependencies supplied to API route composition, including repositories, origins and security.
  Fields: `repository`, `progress?`, `security`, `ping`, `assetsRoot`. Related contracts: `CatalogRepository`, `AccountProgressRepository`, `Security`.

### [auth.types.ts](../projects/middleware/src/core/auth/auth.types.ts)

Source: `projects/middleware/src/core/auth/auth.types.ts`.

- [ ] **AuthConfig** (type) — Retained legacy OIDC session-service configuration; the active runtime uses Auth0Config instead.
  Fields: `origin`, `issuer`, `clientId`, `clientSecret`, `editors`.

- [ ] **Identity** (type) — Server-authorized user identity, editor permission and retained CSRF field shared by security implementations.
  Fields: `id`, `name`, `editor`, `csrf`.

- [ ] **SessionDocument** (type) — Legacy session authentication database record, retained for compatibility/security regression behavior.
  Fields: `_id`, `user`, `subject`, `name`, `csrf`, `expiresAt`, `idleAt`.

- [ ] **LoginDocument** (type) — Legacy OIDC authorization handshake state, including PKCE verifier, nonce and expiry.
  Fields: `_id`, `verifier`, `state`, `nonce`, `returnTo`, `expiresAt`.

- [ ] **Security** (type) — Server security interface for request handling, signed-in access and editor authorization.
  Fields: `handle`, `requireUser`, `requireEditor`. Related contracts: `Identity`.

- [ ] **Auth0Config** (type) — Active bearer-token validation settings: origin, domain, client, audience and editor allowlist.
  Fields: `origin`, `domain`, `clientId`, `audience`, `editors`.

### [game-document.ts](../projects/middleware/src/modules/documents/game-document.ts)

Source: `projects/middleware/src/modules/documents/game-document.ts`.

- [ ] **Document** (type) — Private open database-document shape used by the owning adapter/migration to preserve unknown fields.

- [ ] **GameArrays** (type) — Private normalized per-game arrays used while adapting stored game documents.
  Fields: `story`, `achievements`, `events`, `characters`, `inventory`, `plans`, `teams`. Related contracts: `StoredStory`, `StoredAchievement`, `StoredEvent`, `CatalogEntry`.

### [main-quest-document.ts](../projects/middleware/src/modules/documents/main-quests/main-quest-document.ts)

Source: `projects/middleware/src/modules/documents/main-quests/main-quest-document.ts`.

- [ ] **Document** (type) — Private open database-document shape used by the owning adapter/migration to preserve unknown fields.

### [stored-document.types.ts](../projects/middleware/src/modules/documents/stored-document.types.ts)

Source: `projects/middleware/src/modules/documents/stored-document.types.ts`.

- [ ] **StoredAchievementRow** (type) — Permissive stored achievement row preserving optional legacy fields and unknown data.
  Fields: `_id?`, `title?`, `order?`, `icon?`, `reward?`, `rewardIcon?`, `description?`, `url?`, `notes?`, `requirements?`.

- [ ] **StoredAchievement** (type) — Stored achievement category/parent with nested achievement rows.
  Fields: `achievements`. Related contracts: `StoredAchievementRow`.

- [ ] **StoredStory** (type) — Nested stored story category with ordered subsections and preserved unknown fields.
  Fields: `kind?`, `game?`, `category`. Related contracts: `CatalogEntry`.

- [ ] **StoredEvent** (type) — Permissive stored parser/event shape used during catalog adaptation.
  Fields: `title?`, `url?`, `icon?`, `eventType?`.

- [ ] **StoredGameDocument** (type) — Permissive MongoDB game document spanning current arrays and older nested catalog/version fields.
  Fields: `gameId?`, `gameConfiguration?`, `content?`, `story?`, `achievements?`, `events?`, `characters?`, `inventory?`, `plans?`, `teams?`, `catalog?`, `version?`. Related contracts: `GameDocument`, `StoredStory`, `StoredAchievement`, `StoredEvent`, `CatalogEntry`.

- [ ] **StoredQuestEntry** (type) — Stored main/character quest record accepted by quest migration/adaptation.
  Fields: `id?`, `name`, `category`, `mainStory?`, `sideStories?`. Related contracts: `PatchOverview`.

### [image-category-migration.ts](../projects/middleware/src/modules/images/image-category-migration.ts)

Source: `projects/middleware/src/modules/images/image-category-migration.ts`.

Supporting modules: [image-category.constants.ts](../projects/lib/constants/image-category.constants.ts), [image-recommendations.constants.ts](../projects/lib/constants/image-recommendations.constants.ts), [image-categories.ts](../projects/common/images/image-categories.ts).

- [ ] **ImageCategoryPlan** (type) — Auditable proposed image metadata change including prior category, evidence, checksum and changed state.
  Fields: `folder`, `filename`, `previous`, `next`, `reason`, `uses`, `sha256`, `changed`. Related contracts: `ImageDetails`, `ImageUse`.

### [images.repository.ts](../projects/middleware/src/modules/images/images.repository.ts)

Source: `projects/middleware/src/modules/images/images.repository.ts`.

Supporting modules: [image-category.constants.ts](../projects/lib/constants/image-category.constants.ts), [image-recommendations.constants.ts](../projects/lib/constants/image-recommendations.constants.ts), [image-categories.ts](../projects/common/images/image-categories.ts).

- [ ] **FileInfo** (type) — Image repository projection containing dimensions, format, byte size and timestamps.
  Related contracts: `GameImage`.

### [progress.repository.ts](../projects/middleware/src/modules/progress/progress.repository.ts)

Source: `projects/middleware/src/modules/progress/progress.repository.ts`.

- [ ] **ProgressDocument** (type) — Account ProgressSnapshot with MongoDB document identity.
  Fields: `_id`. Related contracts: `ProgressSnapshot`.

## Test-only helpers (7)

### [genshin-impact.spec.ts](../projects/data-parser/src/legacy/parsers/genshin-impact.spec.ts)

Source: `projects/data-parser/src/legacy/parsers/genshin-impact.spec.ts`.

- [ ] **ParserFixture** (type; legacy regression code) — Legacy parser-test fixture exposing the parser state/methods required by its regression tests.
  Fields: `parser`, `service`.

- [ ] **ParserMethod** (type; legacy regression code) — Legacy parser-test method-name union used to call or spy on fixture methods.
  Options: `getVersionInfo`, `parseEvents`, `createStaticEvents`, `parseSummonBanners`, `parseSourceData`.

### [honkai-star-rail.spec.ts](../projects/data-parser/src/legacy/parsers/honkai-star-rail.spec.ts)

Source: `projects/data-parser/src/legacy/parsers/honkai-star-rail.spec.ts`.

- [ ] **ParserFixture** (type; legacy regression code) — Legacy parser-test fixture exposing the parser state/methods required by its regression tests.
  Fields: `parser`, `service`.

- [ ] **ParserMethod** (type; legacy regression code) — Legacy parser-test method-name union used to call or spy on fixture methods.
  Options: `getVersionInfo`, `parseEvents`, `parseTreasuresLightward`, `parseSourceData`, `createStaticEvents`.

### [wuthering-waves.spec.ts](../projects/data-parser/src/legacy/parsers/wuthering-waves.spec.ts)

Source: `projects/data-parser/src/legacy/parsers/wuthering-waves.spec.ts`.

- [ ] **ParserFixture** (type; legacy regression code) — Legacy parser-test fixture exposing the parser state/methods required by its regression tests.
  Fields: `parser`, `service`.

- [ ] **ParserMethod** (type; legacy regression code) — Legacy parser-test method-name union used to call or spy on fixture methods.
  Options: `createStaticEvents`, `parseSourceData`, `parseEvents`, `doubledPawnsMatrix`, `parseTowerOfAdversity`, `parseWhimperingWastes`.

### [chalk.ts](../projects/data-parser/src/test/mocks/chalk.ts)

Source: `projects/data-parser/src/test/mocks/chalk.ts`.

- [ ] **ChalkFn** (type) — Callable chainable chalk mock used by parser tests without terminal-color behavior.
  Fields: `bold`.

## Compatibility and modeling notes

- [ ] **Deprecated does not mean unused:** `Entry` and `LegacyCatalogEntry` remain active in editor projections/adapters. Replace call sites before removal.
- [ ] **Legacy authentication stays distinct:** `AuthConfig`, `SessionDocument` and `LoginDocument` support retained OIDC/session code; `Auth0Config` describes the active bearer-token path.
- [ ] **No dedicated types for every feature:** plans, achievements, navigation categories and several substructures use `Kind`/`CatalogEntry` plus inline fields or stored adapters. Do not infer separate `Plan` or `Achievement` interfaces where none are declared.
- [ ] **Repeated names have local scope:** `Document`, `BackupCollection`, `BackupManifest` and legacy parser test fixtures are listed per source file; identical names are not a single shared definition.
- [ ] **Types are not validation:** consult supporting validators before changing required fields, enum values, IDs or persistence shapes. Preserve account identities and completion keys when changing shared contracts.

For ownership and import rules, see [code organization](code-organization.md). This inventory describes source declarations and supporting code; it is not a database field-usage audit or a guarantee that every optional field is populated.

## Progress activity metadata (implemented)

- [x] **GameProgressDates** (`player-progress.type.ts`) - Per-game ISO timestamps for actual personal progress changes. Server-owned for accounts and device-owned for guests. Supporting helper: `common/player/progress-activity.ts`.
- [x] **ProgressSnapshot.gameUpdatedAt** - Optional additive metadata alongside `state` and `revision`; saved atomically with progress and returned in personal dashboard projections. Older snapshots remain readable without it.
