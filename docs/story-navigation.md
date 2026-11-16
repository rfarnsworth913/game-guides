# Story guide navigation

Story Navigation follows the guide's saved subsection order. Patch Overview and Main Story templates form the top level. Each subsequent non-divider subsection appears beneath the preceding top-level entry, in the same order as the guide. Character/story quests remain secondary items. Content before the first top-level entry stays visible as secondary items without an artificial chapter heading.

Chapter titles navigate to the section and expand its children. The chevron expands or collapses without navigating. Chapters initially start collapsed, and opening one closes the previous chapter. A minus button beside Story Navigation appears only while a chapter is expanded and closes that chapter. There is no Expand all action. Keyboard focus is visible, and the active section has `aria-current="location"`.

Children slide and fade during expansion and collapse, with a matching rotating chevron. Collapsed content is inert and hidden from assistive technology immediately, so its links cannot receive keyboard focus during the closing animation. Reduced-motion preferences disable transitions. Content that precedes the first chapter remains visible without a synthetic accordion heading.

Content-type icons precede actual titles at every depth: blue patch overviews, cyan main quests, teal character/story quests, green world quests, pink character information, purple lore and orange events. Unselected rows use neutral surfaces; only the selected row uses the game's highlight color. A collapsed parent represents its selected hidden child. The title and chevron share one row background, while retaining separate navigation and expansion actions.

The vertical connector communicates guide order. Scrolling continues to select the section nearest the center of the visible content area below the sticky header. Dividers remain absent from navigation. Global guide search still searches all navigation categories for the current game; the previous separate Browse Content directory is no longer displayed here.

This redesign changes presentation only. It does not reorder, migrate or delete saved story content or completion data.
