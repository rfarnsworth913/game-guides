# Shared image library browser

Every `gg-game-image-picker` uses the same image browser. Browse Library opens existing images for the current game; upload controls remain in the parent picker. Selecting or previewing an image never saves the parent entity or edits library metadata. Cancel preserves its original reference and attribution.

Full-size pickers show the selected image name beneath the preview by default. Navigation group banners opt into separate translucent image-name and metadata overlays and a guidance bar. Compact icon buttons retain their small selector/popover layout and visible size recommendations.

## Browsing and selection

- The fixed header describes the image selector and its recommended dimensions. Search and sort share a toolbar; category tabs replace the old image-type dropdown.
- Search matches names, filenames and stored metadata, including descriptions and tags containing character/region names. Input is debounced. Sort by name, creation time or images used in the current selector session.
- Categories come from `projects/lib/constants/image-category.constants.ts`. Existing `banner`, `character`, `icon` and `landscape` values remain valid; `character` displays as Splash Art and `landscape` as Other. The additive `headshot` category identifies portraits. Explicit categories take priority over aspect ratio, including square splash art. An image used in multiple roles can have secondary `categories` and appears in each matching tab.
- The relevant category opens initially. Users may switch to All. Reopening the same selector preserves its query, category, sort, loaded page count and scroll position for that editing session.
- Click a card to select; double-click or press Enter on it to confirm. Arrow keys move through the grid. The parent receives the existing image URL and stored attribution, then controls when the entity is saved.
- The enlarge action opens a read-only preview with dimensions, aspect ratio, format, file size and available source metadata. Escape closes that preview first; Escape in the browser cancels it. There are no upload, rename, delete or metadata-editing actions inside the browser.

Different aspect ratios remain selectable by default, with a warning and proportional thumbnail. Optional `allowedImageTypes` and `allowOtherAspectRatios` picker inputs support stricter callers. Images render in batches of 48 with lazy-loaded thumbnails. The fixed footer shows the selected name and confirmation controls.

## Storage and compatibility

Existing original-image URLs and metadata sidecars remain authoritative. `GET /api/games/:game/images` adds optional file dimensions, size, format, timestamps and a thumbnail URL. Original downloads return unchanged bytes.

## Existing asset classification

On November 25, 2026, all 322 game-library images received metadata sidecars. Classification uses shared catalog references, descriptive filenames and dimensions. Unreferenced assets were checked separately; the unreferenced Herta portrait and Etchings event artwork have explicit reviewed classifications. Tags include game and content titles where catalog references exist. Images can appear in several filters: 133 banners, 102 headshots, 98 splash-art images and 54 icons. These counts overlap.

Run `npm run middleware:image-categories -- --plan` to audit without changing files, or `--apply` to write missing metadata. The command reads the configured shared catalog but never writes database records. Apply creates a backup manifest in `backups/image-categories-<timestamp>/manifest.json`, checks the whole plan for concurrent changes, writes sidecars atomically and verifies every original image's SHA-256 hash. Reports are in `tmp/image-category-audit/`. A second plan after this migration reports zero changes.

The backup manifest records each sidecar's exact previous text (or `null` when absent). To restore metadata, restore that text to the corresponding `.json` sidecar, removing only sidecars whose previous value was `null`; leave original image files untouched. Existing attribution and custom tags are preserved. Future uploads receive the category of their picker automatically. The browser sort control uses the shared form-select styling.

`GET /api/games/:game/images/:filename?thumbnail=1` returns a WebP derivative bounded to 480 × 360, preserving proportions and transparency. Sharp generates these derivatives without rewriting originals. In-process thumbnail and metadata caches are bounded; the UI caches library lists briefly and invalidates them after upload/metadata updates or account changes. Full-resolution artwork is fetched only for a selected parent preview or the enlarged browser preview, rather than for each grid thumbnail.

The image decoder limits thumbnail input to 40 million pixels. A file that cannot be decoded returns a preview error rather than deleting the original. Existing source images and metadata remain available for repair. Desktop/mobile browser checks and image integration tests cover selection isolation, metadata, thumbnails and preservation of original bytes.
