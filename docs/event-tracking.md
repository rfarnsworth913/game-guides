# Event tracking

Open **Events** within a game. The tracker reads the existing game catalog, including parser-produced records in the database's `events` array.

- **List** shows compact rows with event artwork when available, type badges, completion controls, and time remaining. Missing artwork falls back to the event's initial.
- **Calendar** shows a Monday-first month grid, month navigation, and a Today button. Multi-day events appear on every scheduled day. Events without usable dates remain accessible below the grid.
- Type filters, search, and **Show completed** apply to both views.
- Select an event's name or row to open its attached HTTP(S) URL in a new tab. Completion controls are separate and do not navigate. Events without a valid URL remain visible.
- Completion uses existing per-account player progress, or `gg-player-v1` browser storage for guests. It does not change a database event's shared completion flag.

Parser records retain their original shape. The API exposes their title, URL, icon, type, and dates through the shared catalog adapter, without copying them into editable event records when another catalog item is saved. Parser event IDs are deterministic and include the event period, keeping completion stable across reloads and fresh for a newly parsed period. The UI does not invent recurrence schedules or reset dates independently of the parser.

Date-only start and end values use local calendar days. End dates include the full final day; timestamp values retain their explicit time zone. Countdown labels refresh every minute. Editors can add custom events with a type, dates, and URL; existing custom records retain edit/delete controls in the list view. Parser event definitions remain managed by the parser.
