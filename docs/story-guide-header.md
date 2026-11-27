# Story guide header

The expanded Story Guide header owns the page title, date, region tabs, overview, optional category statistics, search, incomplete filter and editor controls. It scrolls away normally. A compact toolbar replaces it after the expanded area leaves the top of the viewport. It shares region selection, progress, search and edit state with the page; it does not fetch or save separate copies of guide data.

Editors configure artwork through **Edit mode → Edit section → Region Header Background**, using the existing image picker. This reuses the navigation category's `sectionImageUrl` (stored as the category `imageUrl`), independently of its icon. Existing configured images immediately become header artwork. Missing or failed images fall back to a dark gradient. No database migration is required, and no quest images, ordering or completion records are changed.

The desktop compact toolbar is 72px tall. Its actual height is measured for navigation offsets, including mobile search expansion. The large artwork, statistics and overview never remain sticky. The toolbar occupies a stable zero-height overlay slot so switching modes does not move quest content. Native region selectors replace tabs on narrow screens; a search/filter button reveals compact mobile controls.

Click the compact percentage/progress button to open overall and category details without returning to the top. The panel uses the same live statistics as the expanded header, has internal scrolling on smaller screens, and does not move quest content. Click again, click outside, or press Escape to close it. Changing regions or returning to the expanded header also closes the panel. Region selectors and their options use explicit theme-aware text and solid background colors for readability.

An IntersectionObserver watches the entire expanded header, rather than a small marker that could be skipped by a large mobile scroll. A ResizeObserver measures the toolbar. Both are disconnected on destruction. Inactive header controls are inert, and reduced-motion preferences disable transitions. The existing game-wide search and all editor authorization rules remain in force.

The Last Updated label retains the date supplied by the existing workspace; this change does not introduce a new catalog timestamp or alter its meaning.
