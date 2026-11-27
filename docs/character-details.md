# Character Details

Open a character card from My Collection or Character Catalog. The same dialog handles every game using its shared rules and character definition; inventory cards keep their square headshots.

## Personal progression

The fixed header contains identity, rarity, primary attributes, ownership and favorite controls. The left pane has horizontal tabs derived from applicable rules; the right pane holds contained full artwork and independent resource accordions. On narrow screens the panes stack, with progression first. Tabs support arrow-key navigation. Close/Escape and editor navigation ask before discarding a changed draft. Failed saves retain edits.

- **Level & Promotion:** current and target controls share existing ascension gates. Changing a target level resolves the first sufficient promotion stage and shows intermediate milestones, without altering current progression. The indicator is explicitly labelled level/milestone progress; unconfigured experience weights are never invented.
- **Skills:** profile tracks and character overrides supply numeric, discrete-rank and independent unlock controls. Dependency labels show configured prerequisites, including branching prerequisite graphs. Legacy active/passive skills retain their IDs and caps. Descriptions and configured ability icons appear in expandable rows.
- **Weapon / Equipment:** tabs come from configured equipment slots, not game names. `system: "weapon"` identifies a weapon equivalent; the existing `weapon` slot ID remains a compatibility fallback. Craft Essences and other systems stay Equipment unless explicitly configured otherwise.
- **Goals:** `completedGoals` stores planning checkmarks independently of actual level and skills. **Mark Goal Complete** and **Reopen Goal** do not alter invested progression. **Set Current to Target** is a separate validated draft action. Saving does not automatically consume inventory materials.
- **Unowned characters:** users can view resources, favorite characters and plan targets without marking them owned. Current progression controls are disabled. An explicit shared `attributes.playable: false` hides progression tabs without guessing playability from names or game identity.

All personal changes use existing revision-checked account progress writes. Guest changes use the established local browser state. Shared catalog definitions are never modified by personal progression saves.

## Shared character configuration

The Images section has three independent selectors. **Character Icon** stores the square headshot in `characterDefinition.headshot` and keeps the legacy entry icon in sync. **Splash Art** edits `characterInformation.imageUrl`, shared with Story Guide placements and used as the default dialog header background. **Character Banner** stores an optional `characterDefinition.banner` override for the dialog header only; removing it or encountering a failed banner request falls back to splash art. Icon and splash cards sit above the full-width banner card and stack on narrow screens. Existing image attribution is preserved.

The existing editor-only shared character dialog now exposes progression-profile selection, custom attribute values, and grouped resource definitions. Editors access it after leaving Character Details, so no editing modal is nested inside the planner. Existing curated guides remain supported. Internal resources select same-game Story Guide content; external links use safe HTTP(S) destinations and `noopener noreferrer`.

Official lore, build guides, videos, fanworks and related content appear as nonempty expandable groups. Additional categories are supported. Expansion survives progression-tab changes. Character artwork uses the configured full artwork, then a headshot fallback; failed image requests have a text fallback. Source information remains visible when configured.

## Owned equipment copies

Shared definitions live on existing inventory catalog records as `equipmentDefinition`. Owned copies live only on that inventory record's account `equipmentInstances`. The character's existing `gear[slotId]` array references copy IDs. Unequipping leaves the copy, its upgrade targets and its stats in inventory. Legacy free-text gear remains visible; it is not silently matched or converted to an item.

Game rule slots optionally define `system` and `allowedTypes`; these controls are available in Game Rules → Progression → Existing game-wide progression and equipment. Shared inventory equipment metadata can be supplied through the existing catalog API/import structure:

```typescript
equipmentDefinition: {
    typeId: "sword",
    weaponType: "Sword",                  // optional compatibility constraint
    progressionTracks: [/* verified track definitions and upgrade costs */],
    stats: [{ name: "Configured stat", value: "Verified value" }],
    setId: "verified-set",                // optional
    setBonuses: [/* { pieces, description }, using verified thresholds */]
}
```

The UI can explicitly start tracking an untracked owned copy, up to the inventory quantity. Compatible existing copies can be assigned or replaced. Copies already equipped elsewhere are identified and must be unequipped before reassignment. Both current and target equipment progression support the same numeric/unlock track controls. Shared stats and any saved per-copy main/substats are displayed. Set bonuses activate at configured thresholds; no two/four-piece assumptions are built in.

Equipment updates and character assignment are saved in one account revision. The server validates quantity, copy uniqueness, slot/type compatibility, progression bounds/dependencies and duplicate assignment across the proposed account state. These validations also run for guest saves. Concurrent inventory edits produce an error rather than overwriting another draft.

This implementation does not populate weapon/equipment definitions, random stats, set bonuses, verified costs or per-game presets. Games without those definitions show explicit unavailable/empty states. It also does not introduce a separate inventory equipment-definition editor; the shared catalog API/import remains the configuration path for that metadata.

## Material calculations

`character-materials.ts` is the shared calculation layer for Character Details and Farming. It resolves profile overrides and existing character recipes, finds configured intermediate transitions, includes prerequisites once per track, aggregates by stable inventory item ID, and reports owned/required/missing quantities. Skill rows show their individual costs; the character plan includes equipped-copy upgrade costs. Inventory unfinished-goal filters include equipment goals.

Missing transitions, absent material records or ambiguous upgrade routes produce incomplete-data messages. Missing configuration never means free upgrades. A verified empty legacy recipe remains a zero-cost transition. The current configuration model describes prerequisite DAGs and explicit transitions; alternative route selection and experience-weighted progress require additional verified configuration rather than an assumed path.

## Validation

Tests cover shared rules across eight game IDs, numeric and node progression, target isolation, promotion milestones, persistent resource expansion, separate planning completion, save failures, equipment ownership/assignment, set metadata and inventory deficits. Browser integration verifies the new dialog at desktop/mobile sizes, refresh restoration, atomic equipment saves, and unequip retention, alongside the existing Story Guide and account-isolation regression checks. Browser fixtures and MongoDB are disposable; no live data migration is performed.
