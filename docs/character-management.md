# Character management v1

## First use

The character modal is now a development planner. It puts current and target levels, ascension, upgradeable skills, and configured progression tracks first, with guides and personal notes in a sidebar. Fixed-level skills and passives, empty equipment sections, and repeated reference descriptions are omitted from the main planner. Select the character name or portrait to view preserved shared reference information.

Current values remain in the existing collection fields. Optional `target` stores an independent progression/equipment goal; missing targets display current values without creating a plan until a target is edited. Targets cannot be below current progression, and both states must fit the game's ascension and skill limits. Ascended characters must also meet the previous rank's level cap. Current values are never automatically raised to match goals.

Personal `notes` and `personalGuides` use the existing player-progress storage and remain separate from shared descriptions and curated guides. Ownership can be changed without clearing the plan; explicit removal still clears the saved build after confirmation. Old records and shared links remain supported without migration.

Material calculations currently show **Unavailable**: the existing inventory tracks quantities, but there are no character-specific upgrade transition recipes to calculate costs. No illustrative quantities or material completion percentages are shown. Equipment goals retain the existing slot names and item lists; item catalogs, weapon upgrade recipes, and inventory-driven material planning remain follow-up work once authoritative upgrade data is available.

1. Open a game, then **Characters**.
2. An editor selects **Game rules** and verifies the game's level cap, rarities, weapon/damage options, equipment slots, and progression tracks. Initial dialog values are editable starting values, not verified game presets. Rules are configured once per game.
3. An editor uses **+ Catalog character** to create shared definitions: name, rarity, portrait, weapon type, damage type, roles, description, active/passive skills, and guide links.
4. Any player opens **Character catalog**, selects a character, enters a level/equipment/progression, and chooses **Add to collection**.
5. **My collection** lists owned characters. Clicking one shows shared information and an editable personal build together. Saving updates only that player's build. Removing asks for confirmation, clears that personal build, and leaves the shared character available in the catalog.

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
