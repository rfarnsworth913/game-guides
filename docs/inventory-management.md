# Inventory management

Each game's Inventory page uses the existing shared catalog and account progress. Existing item IDs, quantities, equipment copies, character references, and manual plans are preserved; this change requires no destructive migration or live database changes.

## Everyday use

The page has a Settings gear, horizontally scrolling categories, live material search, a summary of matching items, and independently collapsible groups. Search includes names, descriptions, aliases, and tags. Category selection includes descendants. The summary counts distinct matching definitions; Sufficient, Partial, and Missing count only items with positive requirements.

Owned quantities are editable in Normal Mode. Plus/minus saves one changed item through the existing revision-checked progress endpoint. Typed input commits on blur or Enter. Empty, negative, fractional, unsafe, and out-of-stack values are rejected. Failed saves retain the intended value and offer Retry. Updates preserve category expansion and do not replace the page layout.

The four summary counts appear in info boxes on one row. The gear dropdown provides **Import Counts** (JSON map, `{itemId, quantity}` record array, or `itemId,quantity` CSV) and **Reset Inventory**. Imports preview changes, reject invalid or foreign-game IDs as a whole, and leave omitted items untouched. Reset requires confirmation and clears all current-game counts regardless of search/category; shared definitions and upgrade goals remain intact. Owned equipment copies must be removed through their normal workflow before resetting their counts. Editors have an **Edit Mode** switch beside Settings; the **Create Item** button appears there only while Edit Mode is enabled.

An item name opens a compact explanation of its active requirements. There is no permanent details sidebar or farming-information panel. Large catalogs render incrementally in batches of 96 entries; quantity controls use full numbers rather than abbreviated editable values.

## Shared catalog editing

Editors enable **Edit Mode** beside Settings to add, edit, remove, or deactivate item definitions. Quantity editing is independent of this mode. Existing shared item dialogs provide artwork selection, rarity, description, category, aliases, tags, and enabled status. Deactivation preserves account quantities. Removal remains subject to existing catalog reference checks and recipe validation.

**Settings → Categories, rarities & recipes** opens the Inventory section of the existing Game Rules editor. All changes save with the parent rules form. Configure:

- Categories: stable identifier, label, optional symbol, display order, optional parent, enabled status.
- Rarity icon backgrounds: explicit numeric rarity-to-color mappings for that game. Unconfigured rarities use a neutral background.
- Conversion recipes: stable identifier, output material and quantity, ingredients, currency materials, optional completed-content unlocks, and enabled status.

Categories and recipes live under `characterRules.inventory`; item assignments, aliases, tags, and deactivation live under `inventoryMetadata` on the existing inventory catalog entry. Legacy category text continues to work without configuration. New item category IDs must refer to configured categories. No real-game categories, recipes, rarity colors, or progression costs are fabricated or seeded automatically.

## Requirements

`projects/common/inventory/inventory-requirements.ts` derives requirements from active manual material plans and the same shared progression calculators used by Character Details and farming. Character profile tracks, promotion, abilities, equipped upgrades, and unequipped equipment-copy upgrade targets contribute. A given equipment copy is counted once. Repeated material costs aggregate by stable material ID; currencies are inventory materials too.

Each contribution retains its character, equipment copy, or plan source. Manual plans remain independent goals: a manually entered plan intended to duplicate a character's existing target should not also be kept active. Unknown upgrade costs generate a visible warning; missing formulas are never treated as verified free upgrades. Needed, Missing, Surplus, and summary statuses are calculated views, never authoritative stored inventory quantities.

## Crafting

An item with enabled recipes offers **Craft / Convert**. The dialog lists recipe alternatives, ingredient/currency needs, owned and reserved quantities, craftable batches, and the proposed inventory result. Multiple output recipes require selection. Chained conversions are optional; ambiguous intermediate conversions also require an explicit choice. Batch quantity means the number of executions of the selected recipe, multiplied by its configured output quantity.

Craft previews do not mutate inventory. Confirmation revalidates recipe configuration, availability, unlocks, quantities, reservations, and stack limits. Materials already required by active upgrade plans are reserved. Category and recipe graphs must be acyclic; recipe references must resolve within the current game's catalog.

Signed-in confirmation calls `POST /api/me/inventory/:game/craft` with `{ revision, recipeId, quantity, chained, recipeChoices }`. The server loads the authenticated account's progress and current shared rules, recomputes all changes, and applies ingredients, currencies, and outputs in one compare-and-swap account update. Stale revisions and duplicate submissions cannot partially consume ingredients or duplicate outputs. After a conflict, reload and review the updated recipe result before retrying. Guest crafting uses the same calculator and the existing local progress mutation.

Crafting material conversions do not create equipment instances, consume materials for merely setting character goals, or automatically complete progression tracks. Those remain separate workflows.

## Verification

Tests cover summary semantics, quantity validation and failed-save recovery, editor visibility, expansion state, profile-driven requirements, equipment deduplication, all eight configured game identities, currency and repeated ingredient costs, unlocks, alternative and chained recipes, cycles, stack limits, authentication, account isolation, stale revisions, and concurrent crafting confirmations. Browser checks use disposable guest storage and synthetic catalogs; they never connect to the live database.
