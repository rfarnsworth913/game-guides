# Farming planner

Open **Farming** within a game. The page uses existing character goals and the same personal inventory as Inventory; it creates no duplicate character builds or stock records.

## Planning

- Active owned character goals are selected by default. Toggle portraits, select all, clear the selection, or include other owned characters. Preferences and filters are remembered per game and account in this browser.
- **Character upgrade recipes** calculates each unconsumed level, ascension, skill, and additional-progression transition from current to target. An explicit recipe with no costs is a verified free transition. A missing recipe produces a visible data issue and partial costs, never an invented zero.
- **Saved material plans** is a separate requirements mode for existing explicit plans. A shared plan is counted once even when several selected characters belong to it. Plans without assigned characters can be included explicitly. These modes avoid automatically counting an explicit plan and its character recipe twice in the Farming page.
- Requirements aggregate by canonical material ID before inventory is subtracted. Materials appearing under alternative sources retain the same owned quantity. No reservation, crafting conversion, or drop-rate estimate is assumed.
- Summary metrics count distinct shortages, acquisition groups with shortages, and known costs covered. They do not average unrelated item quantities into one percentage.

## Sources and schedule

Groups are based on configured acquisition sources, with many-to-many material mappings. Materials with no source remain visible in **Source not configured**. List view deduplicates materials. Both views support source category, region, rarity, missing/owned stock, availability, and sorting. Character links open the existing development planner directly. Material details edit the existing personal inventory and update all affected groups without reloading.

Schedule view shows configured weekly availability. A server's IANA time zone and local daily reset determine the current game day, including daylight-saving transitions. No game/server reset schedule is assumed. A source with no availability data is unknown; a rotating source without a selected server cannot be labelled available today. Source restrictions and guide links remain separate from weekly availability. Weekly reward claims and dated availability exceptions are not automatically tracked by this feature.

## Verified data configuration

Editors use **Configure farming data** to manage sources, their material mappings, weekday availability, locations/guide URLs, server resets, and individual character upgrade transitions. Definitions persist through the existing editor-only catalog API and revision checks:

- `characterRules.farming` contains shared source and server definitions.
- `characterDefinition.recipes` contains per-character transition costs using inventory material IDs and stable skill/progression keys.

Inventory and character planners also consume these recipes. Character details display known material costs and missing-data warnings; Inventory combines configured character costs with explicit saved plans. Users should avoid entering an explicit plan that duplicates an automatically calculated character goal when reviewing Inventory's combined totals.

No sample costs, locations, or schedules are seeded. Existing catalogs, character builds, quantities, and backups remain compatible. Existing JSON backups include these definitions through character rules and character definitions. Source references and recipe material IDs are validated against the selected game's catalog. Configuring farming data does not change a player's current progression or targets.

Numeric equipment/weapon upgrades are not represented by the current equipment-name model. Changed equipment goals are explicitly flagged as unsupported costs until that model and authoritative recipes exist.
