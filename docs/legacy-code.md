# Legacy and compatibility code

Legacy code is retained where removing it could lose regression coverage, break older URLs/backups, or discard stored information. Deprecated implementations must not receive new production features.

| Location | Status | Replacement / removal condition |
| --- | --- | --- |
| `projects/data-parser/src/legacy/parsers/` | Deprecated classes and regression tests | `src/sync/`; port any remaining relevant fixtures before removal. Production imports are blocked by ESLint. |
| `projects/middleware/src/core/auth/auth.service.ts` (`AuthService`) | Deprecated cookie/OIDC provider retained by security regressions | Production uses `providers/auth0.provider.ts`. Do not remove shared return-URL helpers or regressions along with the class. |
| `Entry`, `LegacyCatalogEntry` in `projects/lib/types/workspace.type.ts` | Deprecated combined editor / wire compatibility shapes | New shared contracts use discriminated `CatalogEntry` variants and independent `PlayerState`. |
| `fromCatalog` / `toCatalog`, stored-document decoders | Active legacy compatibility adapters | Keep until old editor projections and persisted records have an explicit migration. Preserve unknown historical fields and stable IDs. |
| `migrateAchievements`, story/character/event migration helpers and guest catalog import | Active legacy data migration paths | Keep until supported backup/browser versions have a documented retirement policy. A function that migrates legacy data remains supported code. |
| `styles/_workspace.scss` | Labeled legacy feature compatibility styling | Sidebar navigation is now component-owned. Move remaining feature rules as their owning components are maintained; explicit shell selectors prevent header/sidebar leakage. |
| Existing date-only event records | Compatible calendar dates | Displayed from local 00:00 through 23:59 without rewriting stored values or IDs. Parser reset metadata remains available as provenance; it no longer shifts calendar-only task dates into a different local day. |

Unused alternate layout/overview components and their orphaned header/theme-switcher components, unreferenced Endfield/ZZZ parser classes and the unused `@shared-lib/*` alias have been removed. The active shell still owns its appearance controls. Use `@lib/*` and `@common/*` for shared imports.

Superseded deployment checklists, old parser reviews and the obsolete lint-count snapshot have been removed. The [deployment roadmap](deployment-roadmap-2026-11-24.md) is the current rollout plan; the [parser guide](data-parsers.md) describes current operation and remaining source gaps. The dated parser validation report and broken-image CSV remain useful evidence and repair work, not current architecture specifications. See [code organization](code-organization.md) for ownership rules and the [documentation index](README.md) for maintained guides.
