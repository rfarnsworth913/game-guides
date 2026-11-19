# Character management v1

The additive contract and progression-profile foundation is documented in [Character management extension](character-management-extension.md). The inventory UI now consumes its registries and progression profiles; advanced shared configuration/resource editors remain a following increment.

Character story-guide profiles now belong to the shared character catalog as well. Story placements reference them by `characterId`; see [Shared character records and migration](shared-story-characters.md) for editing, tracking and backup behavior.

## First use

The browsing page uses compact square-headshot cards in Grid or List view. The header includes Owned, total Characters, and Max Level statistics. **Manage** contains editor-only Game rules and Add catalog character actions; ordinary **Add Character** opens the existing shared catalog.

Search includes alternate names, roles, and classification values. **Filters** combines ownership, rarity, favorites, goal status, and filterable game attributes. Registry-defined attributes control card metadata order and dynamic filters; legacy damage/weapon/role fields supply a fallback only when no registry exists. Sorting and filters are preserved when switching layouts. Results are filtered and sorted before client-side pagination; page size (12/24/48/All) is remembered in browser storage. The existing workspace already loads the shared catalog for cross-feature references, so this UI retains that source rather than introducing a second paginated catalog cache.

The card ownership control changes only ownership and retains current values, targets, gear, favorites, and personal notes. It does not open details. Unowned characters with targets remain visible as Planned in My Collection. Ownership updates use optimistic display state, the existing account progress API, and rollback/error feedback on failure. Favorites use the same account record. The existing detail dialog's explicit removal/reset action still requires confirmation because it clears the build.

Cards use optional `characterDefinition.headshot` first, then an existing icon when it is not the character's full-art image or an obvious splash-art path. Non-square or failed images use a generic initial instead. There is no automatic full-art fallback. Editors can choose a headshot using the existing image picker. Cards reserve square dimensions, lazy-load images, and render them with `object-fit: cover`. Existing full artwork remains untouched on character profiles.

Card level values and maxima come from the character's configured level track (including overrides) or legacy game rules. An explicitly configured target produces a clamped progress indicator; absent rules/targets do not invent a cap or a goal. Max-Level counts only owned characters at their configured character maximum, not the currently unlocked ascension cap. Optional `characterRules.rarityLabels` maps existing numeric rarity values to game-specific display labels without changing stored rarity types. Optional `characterDefinition.alternateNames` supplies search aliases. These additive fields are validated and included in the public character projection; no new endpoint, collection, or database migration is needed for the UI.

The character modal is now a development planner. It puts current and target levels, ascension, upgradeable skills, and configured progression tracks first, with guides and personal notes in a sidebar. Fixed-level skills and passives, empty equipment sections, and repeated reference descriptions are omitted from the main planner. Select the character name or portrait to view preserved shared reference information.

Current values remain in the existing collection fields. Optional `target` stores an independent progression/equipment goal; missing targets display current values without creating a plan until a target is edited. Targets cannot be below current progression, and both states must fit the game's ascension and skill limits. Ascended characters must also meet the previous rank's level cap. Current values are never automatically raised to match goals.

Personal `notes` and `personalGuides` use the existing player-progress storage and remain separate from shared descriptions and curated guides. Ownership can be changed without clearing the plan; explicit removal still clears the saved build after confirmation. Old records and shared links remain supported without migration.

Material calculations use verified transition recipes configured through Farming ? Configure farming data. Current/target changes immediately update known material costs, using the shared inventory quantities. Missing transitions remain explicitly unavailable/partial; no illustrative quantities are shown. Equipment goals retain the existing item-name lists, so numeric equipment and weapon upgrade costs remain unsupported. See [Farming planner](farming-planner.md) for data configuration and scheduling.

1. Open a game, then **Characters**.
2. An editor selects **Manage → Game rules** and verifies the game's level cap, rarities, weapon/damage options, equipment slots, and progression tracks. Initial dialog values are editable starting values, not verified game presets. Rules are configured once per game.
3. An editor uses **Manage → Add catalog character** to create shared definitions: name, rarity, portrait/headshot, weapon type, damage type, roles, description, active/passive skills, and guide links.
4. Any player opens **Character Catalog**, adds a character through its ownership control, or opens details to enter progression and save a development plan.
5. **My Collection** lists owned and planned characters. Clicking a card opens shared information and an editable personal build together. Saving updates only that player's build. Quick ownership removal retains the build; the explicit reset/removal action in details clears it after confirmation. The shared character always stays in the catalog.

No sample characters or unverified game presets are automatically written to the database. Previously created characters remain in the catalog. Their previous quantity-based level is offered as the starting level when first adopting the new collection format; ownership requires explicitly adding the character.

## Data boundaries

Each existing game document keeps its shared `characters` array and now has an optional root `characterRules` object. These use the existing editor-authorized catalog API and game revision checks.

```json
{
  "name": "Example Game",
  "characterRules": {
    "levelCap": 90,
    "ascensionRanks": [
      {"levelCap": 20, "skillLevelCap": 1},
      {"levelCap": 40, "skillLevelCap": 4},
      {"levelCap": 90, "skillLevelCap": 10}
    ],
    "rarities": [4, 5],
    "weaponTypes": ["Sword"],
    "damageTypes": ["Physical"],
    "roles": ["DPS", "Support"],
    "enhancementCategories": ["Weapon", "Artifact"],
    "equipmentSlots": [{"id": "weapon", "label": "Weapon", "limit": 1, "category": "Weapon"}],
    "progressionTracks": [{"id": "ascension", "label": "Ascension", "max": 6}]
  },
  "characters": [{
    "id": "vesna", "game": "example", "kind": "characters",
    "name": "Vesna", "rarity": 5,
    "characterDefinition": {
      "weaponType": "Sword", "damageType": "Physical", "roles": ["DPS"],
      "skills": [{"id": "strike", "name": "Strike", "description": "Example skill", "maxLevel": 8}],
      "passiveSkills": [],
      "guides": [{"title": "Build guide", "url": "https://example.com/vesna"}]
    }
  }]
}
```

This illustrates the new fields; real catalog entries retain the existing required workspace fields. It is not a seed file or a declaration of any game's actual mechanics.

Signed-in builds live in the existing per-account player-progress collection, keyed by `gameId/characterId`. Guests use the existing `gg-player-v1` localStorage record. Neither is embedded in the shared game document.

```json
{
  "genshin/vesna": {
    "completed": false, "quantity": 0, "target": 0,
    "characterCollection": {
      "owned": true,
      "level": 50,
      "ascensionRank": 2,
      "skillLevels": {"strike": 6},
      "gear": {"weapon": ["Excalibur"]},
      "progression": {"ascension": 3}
    }
  }
}
```

The existing API/state envelope preserves backward compatibility. `owned: false` represents removal without deleting the catalog definition. Equipment uses stable game-rule slot IDs and arrays of item names. Renaming a slot's label does not break builds. Removed slots/tracks remain in saved builds until a user explicitly clears them; the detail view exposes obsolete values rather than silently deleting them.

## Validation and behavior

- Only editors can change shared character definitions and rules; any authenticated player can change their own collection. Guest changes stay local.
- The server validates personal levels, slot IDs, equipment counts, and progression limits against the current game rules.
- Configure ascension ranks starting at rank 0 (unascended). Each rank unlocks a character level cap and a skill level cap. Character caps must strictly increase, skill caps cannot decrease, and the last character cap must equal the game's maximum level. An empty or omitted table disables ascension gating. Existing builds default to rank 0 and may need their rank updated when gates are configured.
- Skills and passive skills each have a maximum level (1–1000; older skills default to 1). Personal skill levels default to 1 and cannot exceed either the skill's maximum or the selected ascension rank's skill cap. The server enforces both limits. Skill IDs remain stable when names change or other skills are removed; obsolete saved levels can be explicitly cleared in the collection editor.
- Weapon/damage/role lists constrain new definitions when configured; empty lists allow custom values. Rarity options are enforced for new-format definitions.
- Guides accept HTTP(S) URLs with no embedded credentials; new tabs use `noopener noreferrer`.
- Personal state is rejected in shared catalog payloads. Shared fields are rejected in personal-build payloads.
- Existing revision conflict handling applies to builds and shared rules. Concurrent non-overlapping changes can rebase; conflicting changes require review.
- Guest data is imported only through the existing explicit account import. Existing account builds take precedence over guest builds rather than mixing equipment sets.
- JSON backups include character definitions, collection data, and game character rules. Older backups without rules remain supported. Restoring rules/catalogs requires editor permission, as with other shared definitions.

## Version-one scope

This provides collection CRUD, character details, curated guide links, and configurable game-level progression rules. Equipment is tracked by name, not through a separate shared equipment catalog. Progression tracks store ranks; this does not yet calculate ascension costs, farming material totals, equipment statistics/set bonuses, or game-specific combat formulas. New game mechanics can be represented by new slots/tracks initially, then extended with dedicated models as those features are implemented.

Interaction references supplied for this work: [SEELIE](https://seelie.me/characters), [Genshin Center](https://genshin-center.com/planner), and [WuWa Tracker](https://wuwatracker.com/planner). Their JavaScript planner interfaces were not fully exposed through the text browser; the implementation uses the requested catalog/collection/detail workflow within this application's own styling.
