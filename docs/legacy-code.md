# Legacy and compatibility code

Legacy code is retained where removing it could lose regression coverage, break older URLs/backups, or discard stored information. Deprecated implementations must not receive new production features.

| Location | Status | Replacement / removal condition |
| --- | --- | --- |
| `projects/data-parser/src/legacy/parsers/` | Deprecated classes and regression tests | `src/sync/`; port any remaining relevant fixtures before removal. Production imports are blocked by ESLint. |
| `projects/guides-app/src/app/layouts/game-layout/` | Deprecated alternate layout | `layouts/main-layout/`; not referenced by active routes. ESLint blocks new active-code imports. |
| `projects/middleware/src/core/auth/auth.service.ts` (`AuthService`) | Deprecated cookie/OIDC provider retained by security regressions | Production uses `providers/auth0.provider.ts`. Do not remove shared return-URL helpers or regressions along with the class. |
| `Entry`, `LegacyCatalogEntry` in `projects/lib/types/workspace.type.ts` | Deprecated combined editor / wire compatibility shapes | New shared contracts use discriminated `CatalogEntry` variants and independent `PlayerState`. |
| `fromCatalog` / `toCatalog`, stored-document decoders | Active legacy compatibility adapters | Keep until old editor projections and persisted records have an explicit migration. Preserve unknown historical fields and stable IDs. |
| `migrateAchievements`, story/character/event migration helpers and guest catalog import | Active legacy data migration paths | Keep until supported backup/browser versions have a documented retirement policy. A function that migrates legacy data remains supported code. |
| `@shared-lib/*` TypeScript/Vitest alias | Deprecated compatibility alias | New imports use `@lib/*`; remove after external scripts and older supported consumers no longer need it. |
| `styles/_workspace.scss` | Labeled legacy feature compatibility styling | Sidebar navigation is now component-owned. Move remaining feature rules as their owning components are maintained; explicit shell selectors prevent header/sidebar leakage. |
| Date-only events without a server schedule | Legacy date semantics | Local inclusive days remain the fallback. Parser recurring records use explicit server reset metadata; existing parser records are projected with the configured reset clock without rewriting IDs. |

Historical dated review documents describe the repository at the time of review; they are not current architecture specifications. See `code-organization.md` for current ownership rules.
