# Shared events and story-guide references

Events now use one shared definition in each game's event catalog. Calendars and dashboards read that definition. Event guide placements store `eventId` rather than their own copy of `eventStory`.

The event owns its name, description, dates, event type, artwork and attribution, introduced patch, requirements, content groups, and rows. Artwork is stored in `eventStory`; event lists and dashboards use it when the event has no separate icon. Dates are stored on the event and projected into the template context for reading and editing.

Guide placement IDs, navigation groups, ordering, and row IDs are retained. Calendar, list, dashboard, and linked guide completion use the canonical event ID in player-owned progress. Checking an event completes its required objectives; unchecking clears those objectives. Optional objectives and historical cycle keys stay unchanged. Bulk actions with multiple required objectives require confirmation. Events with no objectives retain a simple completion flag.

Legacy placement progress is a read-only fallback until the account next saves that event. An existing canonical row map takes precedence, including explicit unchecked values. Legacy keys are retained rather than deleted. Completion uses the existing account progress endpoint and revisions, with optimistic calendar feedback and rollback on failure. Guest progress remains in browser storage; guest imports also recognize legacy placements. Linking or editing shared content does not alter the shared catalog's completion state.

## Editing

In an event guide's **Template Details**, select a **Shared Event**, or leave the creation option selected to create a shared event from the section when saving. Options show dates to distinguish periods with the same name. Edits to shared content affect every guide placement for that event. Removing a placement retains the event. Deleting a referenced event is rejected until its references are removed or changed.

Legacy unlinked event guides are converted when an editor saves them. Bulk conversion uses the migration below. Endgame activity guide templates are deliberately excluded: their repeatable objectives retain their existing cycle semantics.

## Parser retention and import identity

Expired non-repeating records are retained, including temporary events, banners, web events, battle passes, TCG events, and permanent events. Cleanup is restricted to parser-owned records explicitly typed `daily`, `weekly`, `weekly-linked`, `monthly`, or `end-game`. Canonical editor-owned definitions are never removed by parser cleanup, even when their source period expires.

Cleanup matches the exact title, type, start date, and end date; it cannot remove a renewed period or a non-repeating event merely because it shares the title. Event imports are deduplicated by title/name and period, with equivalent dates normalized. A later run of an event can therefore be captured while retaining earlier runs. Generic non-event imports continue using title identity.

Original parser records remain intact as import provenance. A shared definition linked to a parser event keeps that event's existing stable period ID. Database decoding exposes the shared definition once, rather than listing both the source and its editable definition. Subsequent catalog saves retain both the original source and the shared definition. Parser changes do not silently overwrite editor-authored content.

## Backup and migration

```powershell
npm run middleware:events -- --backup
npm run middleware:events -- --plan <backup-directory>
npm run middleware:events -- --apply <backup-directory>
npm run middleware:events -- --verify <backup-directory>
```

The backup includes all collections, their indexes, counts, and EJSON checksums. Apply checks revisions and source arrays before writing. It changes only event definitions, guide references, and catalog revisions. A journal records each applied game. Verification checks migrated arrays, unrelated game fields, and every other collection against the backup.

Matching uses normalized English event titles within the same game. Multiple matching periods, incompatible dates, conflicting content, and ID collisions stop migration without discarding records. Resolve ambiguous matches explicitly before retrying. Dates, URLs, notes, requirements, attribution, group and row IDs are preserved.

Applied on November 17, 2026: **50 placements**, **43 newly created shared events**, **7 reused events**, across four games. Backup: `backups/shared-events-2026-11-17T23-43-56-966Z-2d841b3d`. Verification confirmed unrelated game fields and other collections unchanged.

After updating a running development app, restart it and reload open tabs so both server and browser use reference-aware code.
