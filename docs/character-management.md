# Character management v1

## First use

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
    "rarities": [4, 5],
    "weaponTypes": ["Sword"],
    "damageTypes": ["Physical"],
    "roles": ["DPS", "Support"],
    "equipmentSlots": [{"id": "weapon", "label": "Weapon", "limit": 1}],
    "progressionTracks": [{"id": "ascension", "label": "Ascension", "max": 6}]
  },
  "characters": [{
    "id": "vesna", "game": "example", "kind": "characters",
    "name": "Vesna", "rarity": 5,
    "characterDefinition": {
      "weaponType": "Sword", "damageType": "Physical", "roles": ["DPS"],
      "skills": [{"name": "Strike", "description": "Example skill"}],
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
- Weapon/damage/role lists constrain new definitions when configured; empty lists allow custom values. Rarity options are enforced for new-format definitions.
- Guides accept HTTP(S) URLs with no embedded credentials; new tabs use `noopener noreferrer`.
- Personal state is rejected in shared catalog payloads. Shared fields are rejected in personal-build payloads.
- Existing revision conflict handling applies to builds and shared rules. Concurrent non-overlapping changes can rebase; conflicting changes require review.
- Guest data is imported only through the existing explicit account import. Existing account builds take precedence over guest builds rather than mixing equipment sets.
- JSON backups include character definitions, collection data, and game character rules. Older backups without rules remain supported. Restoring rules/catalogs requires editor permission, as with other shared definitions.

## Version-one scope

This provides collection CRUD, character details, curated guide links, and configurable game-level progression rules. Equipment is tracked by name, not through a separate shared equipment catalog. Progression tracks store ranks; this does not yet calculate ascension costs, farming material totals, equipment statistics/set bonuses, or game-specific combat formulas. New game mechanics can be represented by new slots/tracks initially, then extended with dedicated models as those features are implemented.

Interaction references supplied for this work: [SEELIE](https://seelie.me/characters), [Genshin Center](https://genshin-center.com/planner), and [WuWa Tracker](https://wuwatracker.com/planner). Their JavaScript planner interfaces were not fully exposed through the text browser; the implementation uses the requested catalog/collection/detail workflow within this application's own styling.
