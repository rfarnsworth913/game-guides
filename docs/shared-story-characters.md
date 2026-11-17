# Shared character records and story references

Characters used by collections, character planning and story guides now live in the existing per-game `characters` catalog. A story guide placement retains its ID, category, navigation group and order, and stores `characterId` instead of a copied `characterInformation` object.

```json
{
  "characters": [{
    "id": "character-id",
    "kind": "characters",
    "game": "endfield",
    "name": "Example operator",
    "notes": "Shared character description",
    "characterDefinition": {
      "weaponType": "", "damageType": "Physical", "roles": [],
      "skills": [], "passiveSkills": [], "guides": []
    },
    "characterInformation": {
      "imageUrl": "https://example.com/art.webp",
      "imageAlt": "Operator artwork", "sourceName": "Official", "sourceUrl": "https://example.com",
      "faction": "Example faction", "patchVersion": "1.0",
      "groups": [], "rows": []
    }
  }],
  "guidePlacement": {
    "id": "existing-guide-id", "kind": "story", "category": "character-information",
    "name": "Guide navigation title", "storySection": "existing-navigation-group", "order": 3,
    "characterId": "character-id"
  }
}
```

These fragments omit the unchanged workspace envelope fields. `characterDefinition` remains optional for imported profiles whose rarity, weapon, skills and progression data have not been configured. New imports use `rarity: 0`, displayed as “Rarity not set”; an editor must choose the verified rarity before saving a full definition. The migration does not invent those values or automatically add characters to anyone's collection. Until a full definition is configured, imported damage-type information remains in the same character's profile and is available to the character manager.

The shared catalog name and description (`notes`, matching the existing character editor) override the profile's former `characterName` and `summary` fields. A configured definition's damage type is authoritative. Artwork, attribution, icons, faction, patch, content groups, links, row metadata and notes are retained in the character profile.

## Editing and tracking

- The character story editor offers a **Shared Character** selector. An existing character can be selected; saving a new character section creates or matches a character in that game.
- Editing the header, full art, metadata or content groups through a guide changes the shared character. Changes remain local until the parent form is saved. Cancel does not mutate the catalog or another placement.
- Catalog edits to character name, description and damage type appear in its guide references after the workspace refreshes its snapshot.
- Story placement names and navigation order remain independent of the catalog character name.
- Story completion remains keyed by the existing game/placement ID and original row IDs. Repeated placements share content, but retain their own completion records. Existing histories are preserved; additional shared rows start unchecked in other placements.
- Owned state, levels, targets, equipment, skill levels and personal guides remain in player progress. The planner and collection continue using the same existing character IDs.
- The API rejects missing or cross-game character references. A referenced character must be unlinked from its guide placements before its catalog record can be deleted. Removing a guide placement leaves the character available to collections and plans.
- Hydrated profiles in the browser are independent draft copies. Catalog writes strip the projection from the story placement, so the database stores the profile only once.

## Migration procedure

Run from the repository root with the intended database configured in `.env`. No automatic startup migration is performed.

```powershell
npm run middleware:characters -- --backup
npm run middleware:characters -- --plan backups/<verified-backup-directory>
npm run middleware:characters -- --apply backups/<verified-backup-directory>
npm run middleware:characters -- --verify backups/<verified-backup-directory>
```

The backup contains all non-system collections, their indexes, BSON-preserving EJSON, document counts and SHA-256 checksums. It is verified before planning or applying. Backup files are gitignored and should be retained privately.

The migration matches names only within a game using Unicode normalization, whitespace normalization and case-insensitive exact matching. It reuses existing character IDs, creates stable IDs for new characters, merges distinct groups/rows without changing IDs, and replaces each character guide payload with a reference. Ambiguous matches, conflicting metadata or conflicting row IDs stop the migration before writes. No fuzzy identity matching is attempted.

Apply checks every affected game's revision and original story/character arrays before beginning. Each game updates those two arrays atomically with a revision increment; unrelated parser fields and personal-progress collections are untouched. Every successful game is journaled and read back for verification. Repeating an already completed apply is safe. If a concurrent change prevents later games from being updated, retain the backup and journal, inspect completed games, and create a fresh backup before retrying.

For rollback, stop catalog writers and restore the affected game's original `story` and `characters` arrays from its verified EJSON backup with revision checks. Do not replace player-progress collections or blindly restore whole game documents over newer parser data. Refresh/restart clients after applying or rolling back so they use the current revision.

Initial migration plan: 105 character guide placements across Genshin Impact, Honkai: Star Rail, Wuthering Waves, Arknights: Endfield and Neverness to Everness; 103 new catalog characters and two matches to existing characters.

Applied and verified against `backups/shared-characters-2026-11-17T02-56-50-141Z-69911519`. All five games matched the planned story/character arrays after writing; unrelated game fields and all six other backed-up collections were unchanged. Retain this backup and its migration journal.
