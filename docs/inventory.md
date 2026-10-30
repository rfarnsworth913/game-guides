# Inventory

Inventory uses the existing shared item catalog and per-user quantities. Each game has a compact, rarity-styled material grid by default, with a detailed grid option. Stored item artwork is displayed when available; missing or broken artwork falls back to initials and the item name. No sample quantities or external artwork are inserted into the database.

Categories and regions come from that game's actual catalog metadata. Search includes names, categories, and regions. Filters cover owned items, materials missing for plans, covered requirements, rarity, and region when present. Sort by name, quantity, rarity, or missing amount. Rendering starts with 96 items and supports loading more; images load lazily.

Select an item to set an exact quantity or adjust it with Add/Remove, then save. Optional Quick edit saves one-item increments directly from tiles. Bulk entry edits the items displayed when the dialog opens and saves changed quantities in one progress update. Quantities must be whole numbers from zero to the configured stack limit (or 1 billion when no limit is set).

Editors can manage item artwork, category, rarity, optional region, optional stack limit, and a reference URL through the catalog editor. Any player can change their own quantities. Account saves use the existing revision-checked progress API; guests use `gg-player-v1` local storage. Concurrent edits to the same quantity are rejected rather than silently overwriting the other tab. Shared catalog data is not modified by quantity saves.

Required quantities aggregate explicit requirements across all incomplete material plans in the selected game. Each item has one owned quantity, with missing calculated as `max(0, required − owned)`. Item details list contributing plans and their associated characters. Zero-stock items remain in the catalog and appear when missing for plans.

The summary counts distinct materials owned and distinct materials required. **Plans ready** checks each plan independently; stock is not reserved, so two individually ready plans may compete for the same materials. Character development goals currently lack authoritative upgrade recipes and therefore do not contribute fabricated requirements or upgrade-readiness counts. Reservations, crafting conversions, and automatic character upgrade calculations remain future work.
