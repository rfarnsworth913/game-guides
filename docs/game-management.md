# Shared game management

Editors can open the expanded game selector and choose **Add Game**, **Manage Games**, or the edit icon beside a game. Guests and non-editor accounts can browse games but cannot manage them; the API independently requires editor authorization for every registry mutation and the management listing.

The Overview tab contains the title, game type, description, highlight color, optional icon/banner and enabled modules. Every feature has an icon. Game types can be selected from suggestions or entered as text. The Advanced tab contains the stable game ID and short name; an existing game's ID cannot be changed. Legacy taglines remain stored and supply the description when it is empty.

Both artwork fields use the reusable image picker with previews, library browsing and upload support. New files stay in the local draft until Save; a new game is created before its files are uploaded. If an upload fails, keep the dialog open and retry: it retains the draft and does not create another game. An uploaded library asset remains in the library if a later metadata save fails. Existing library selection is available once the game exists.

Field validation is shared with the API. It checks required text, lengths, safe image URLs, unique/reserved IDs, supported features and an opaque highlight color (hex, RGB or RGBA with alpha 1). Invalid fields show inline errors and a summary that focuses the relevant field, including fields on Advanced. Custom colors are normalized and applied to the game's theme with readable foreground text; Reset restores its theme default.

Feature switches control sidebar links, direct-page routing and dashboard cards, panels and summaries. The available switches correspond to implemented modules: Story Guide, Characters, Teams, Inventory, Planner, Events, Farming and Achievements. World quests, lore and related media remain part of Story Guide. Disabling modules preserves their catalog and player records. Creating a game does not create a parser or external data source for it.

## Persistence and compatibility

The existing game document receives additive `_gameId` and `_gameOverview` fields. Original parser-facing document names, catalog IDs and player-progress keys remain unchanged. Display-title edits never rename parser documents or image folders. New game documents use an internal `game:<id>` name; their image folders derive from their stable ID.

Built-in games are seeded from the existing constants only when missing registry metadata. Changes and removal survive application restarts. Overview revisions are separate from catalog revisions; stale overview saves return HTTP 409 and require reloading the management list.

**Remove Game** archives the registry entry. Navigation and dashboards hide it, while its database document, uploads and player progress remain intact. **Manage Games -> Edit / Restore -> Restore Game** makes that same game available again. IDs remain reserved after removal, preventing accidental reassignment of existing progress. There is no hard-delete action.

Back up the complete database and uploaded assets before a production middleware upgrade. Startup adds metadata and an index; it does not purge game data. The existing workspace JSON export is not a substitute for a full database/asset backup.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/games` | Public active game snapshots, including overview metadata |
| GET | `/api/games/registry` | Editor-only overview list, including removed games |
| POST | `/api/games` | Editor-only creation with a validated overview |
| PUT | `/api/games/:id/overview` | Editor-only overview/features update or restoration, with current overview revision |
| DELETE | `/api/games/:id` | Editor-only archive; JSON body contains current overview `revision` |

Existing catalog and image routes support validated custom game IDs. Account-progress validation resolves new game IDs against the repository, so adding games does not require modifying a frontend constant. Archived progress remains stored, but archived games reject new catalog reads and writes until restored.
