# Game events inventory - October 22, 2026

Scope: the six games currently registered in the app. This working inventory covers reported current events, announced upcoming events, and recurring activities. It is not an all-time historical archive. Gameplay, login, and reward events are included; character/weapon banners and general social-media competitions are not catalogued here.

Dates below are the sources' published calendar windows, not normalized UTC timestamps. Same-day availability depends on server and reset time. "Announced" means the event name is documented but its current availability/window was not confirmed. Some source pages are older than this snapshot; expired entries on those pages have been excluded. Direct access to several Fandom/wiki.gg pages was blocked, so secondary calendars are identified explicitly. This is research, not data imported into MongoDB or the app.

## Arknights: Endfield

Reported events and announced upcoming windows, from the [Endfield Build calendar](https://www.enfieldbuild.com/events):

| Event | Published window | Status on Oct 22 |
| --- | --- | --- |
| All the Inky Hues | 2026-10-15 to 2026-11-05 | Current |
| Yuanyuan's Blazing Stoves | From 2026-10-15; end not confirmed by this source | Current/verify closing time |
| Spirit's Restoration | 2026-10-15 to 2026-11-05 | Current; login |
| Season of Phantasia | 2026-10-15 to 2026-11-05 | Current; Echoes of War season |
| Carly's Verdant Anthology | 2026-10-22 to 2026-11-05 | Opening/current |
| Monumental Etching: Forest of Maras | 2026-10-22 to 2026-11-05 | Opening/current; Umbral Monument |
| Arena of Games | 2026-10-29 to 2026-11-19 | Upcoming |
| New Era for the Myriad Souls | 2026-10-31 to 2026-11-14 | Upcoming |
| Contingency Contract: Indigo Experimental Operation | From 2026-11-05 | Upcoming; end unconfirmed |
| Back to the Rustics | From 2026-11-05 | Upcoming; end unconfirmed |
| Season of Fervor | From 2026-11-05 | Upcoming; Echoes of War season |
| The Stars Are With Me | From 2026-11-05 | Upcoming; login |

The [2026 wiki event index](https://endfield.wiki.gg/wiki/Event/2026) gives some endpoints a day earlier than this secondary calendar. Verify exact server timestamps before importing deadlines.

Recurring systems: **Echoes of War** seasons; **Umbral Monument / Monumental Etching** challenge windows. Treat Contingency Contract as scheduled test-season events until a stable reset rule is confirmed. Sources: [calendar and standing systems](https://www.enfieldbuild.com/events), [official news](https://endfield.gryphline.com/en-us/news).

Existing parser reminders: **Stock Redistribution**, **Daily Routine**, **Stamina Spend** (daily), and **Weekly Routine** (weekly). These are labels in `projects/data-parser/src/parsers/arknights-endfield.ts`, not an assertion that every gameplay task is a named event.

## Genshin Impact

Published event windows from the [October event schedule](https://www.pockettactics.com/genshin-impact/events):

| Event | Published window | Status on Oct 22 |
| --- | --- | --- |
| Carefree Snowball Fight | Oct 21 - Nov 2 | Current |
| Across the Frozen Wilds, Honing One's Edge | Sep 23 - Nov 3 | Current; character reward |
| Tabeltop Troupe: A Gathering on Adventure's Eve | Sep 23 - Nov 3 | Current; source spelling retained |
| Overflowing Favor | Oct 26 - Nov 2 | Upcoming; double drops |

Anniversary login rewards ended Oct 19; do not mark that login campaign active simply because it remains on a current-events page. Anniversary mail is separate and may remain claimable according to each message's expiry. [Source](https://www.pockettactics.com/genshin-impact/events).

Recurring challenges:

| Activity | Reset/cycle |
| --- | --- |
| Spiral Abyss - Abyssal Moon Spire | Monthly, on the 16th; distinguish from permanent early floors |
| Imaginarium Theater | Monthly, on the 1st |
| Stygian Onslaught | Version-linked challenge windows |

Sources: [Spiral Abyss](https://genshin-impact.fandom.com/wiki/Spiral_Abyss), [Imaginarium Theater](https://genshin-impact.fandom.com/wiki/Imaginarium_Theater), [current Stygian cycle](https://www.icy-veins.com/genshin-impact/stygian-onslaught-best-characters).

Existing parser reminders: **Daily Commissions** (daily), **Trounce Domain** (weekly), **Paimon's Bargains** (monthly), **Artifact Extraction** and **Artifact Definition** (version-linked). [Artifact Transmuter reference](https://genshin-impact.fandom.com/wiki/Artifact). **Ley Line Overflow**, **Overflowing Mastery**, and similar returning event series should use individually announced windows rather than a fixed recurring timer.

## Honkai: Star Rail

Published event windows from the [October event schedule](https://www.pockettactics.com/honkai-star-rail/events):

| Event | Published window | Status on Oct 22 |
| --- | --- | --- |
| Love, Ghosts & Robots | Sep 28 - Nov 11 | Current |
| Astral Imagea | Sep 28 - Nov 11 | Current |
| Wishpower UP! Down with Voracity! | Sep 28 - Nov 11 | Current |
| Astral Slammers Squad | From Sep 28 | Reported ongoing; closing time unconfirmed |
| Planar Fissure | Oct 12 - 25 | Current; recurring double-drop series |
| Interastral Peace Gala: One Take | Oct 21 - Nov 11 | Current by published dates |
| Free Fate/Stay Night character claim | Jul 24 - end of version 4.6 | Current; reward campaign |
| Garden of Plenty | Oct 30 - Nov 11 | Upcoming; recurring double-drop series |

Recurring challenges: **Memory of Chaos** (the rotating Forgotten Hall challenge), **Pure Fiction**, **Apocalyptic Shadow**, and **Anomaly Arbitration**. Use each announced phase window: version 4.6 has an exception to the usual alternating endgame refresh sequence. [4.6 endgame schedule and official-post reference](https://neonsect.com/honkai-star-rail/hsr-endgame-schedule-4-6/).

Other repeatable activities: **Simulated Universe**, **Divergent Universe / Cyclical Extrapolation**, **Currency Wars**, **Daily Training**, **Echo of War**, **Embers Exchange**, and **Gift of Odyssey** login campaigns. Do not assume all three universe/Currency Wars entries grant independent weekly point rewards: see the [periodic-points consolidation announcement](https://www.hoyolab.com/article/44548609) and [mode overview](https://www.prydwen.gg/star-rail/guides/game-modes). **Realm of the Strange**, **Planar Fissure**, and **Garden of Plenty** return in announced windows rather than on an unconditional daily/weekly timer.

Permanent claims such as **Trailblazing Will**, **Turquoise's Reverie**, and the standard-warp milestone reward are one-time progression rewards, not resetting events. [Event reference](https://www.pockettactics.com/honkai-star-rail/events).

## Neverness to Everness

Published event windows from the [October event schedule](https://www.pockettactics.com/neverness-to-everness/events):

| Event | Published window | Status on Oct 22 |
| --- | --- | --- |
| Pukaland Travelogue | Sep 30 - Nov 11 | Current |
| Born to Race | Sep 30 - Nov 11 | Current |
| Coal Lumps Treasure | Oct 8 - Nov 11 | Current |
| Pixel Surge | Oct 19 - 26 | Current; double rewards |
| Snap Golden Crackshot | Oct 21 - Nov 11 | Current by published dates |
| Gold Clash | Oct 26 - Nov 9 | Upcoming |
| Puka Lucky Flip | Oct 29 - Nov 11 | Upcoming |

Recurring combat: **Beyond the Rails: Prime Circle** and the later **Fracture Circle**. Further circle variants should be checked against current in-game availability. Sources: [Prime Circle guide](https://gamewith.net/nte/75808), [routine checklist](https://zeroluck.gg/nte/routine/).

Other repeatable tracking candidates include daily tasks, weekly objectives, cafe earnings/restocking, City Stamina, and monthly Lost/Hunter/Otherworld exchanges. These are routines or shop resets, not all separate named events. [Routine reference](https://zeroluck.gg/nte/routine/).

Permanent/one-time claims: **Login Rewards**, **Strange Encounters**, **Anomaly Hunter's Journey**, **BigOwl Express**, **Arc Collection**, and **City Guide**. The presence of a login reward does not by itself establish a repeating login campaign. [Permanent-event reference](https://www.pockettactics.com/neverness-to-everness/events).

There is currently no NTE parser registered alongside the other five parsers in this project.

## Wuthering Waves

Published 3.7 phase-two schedule from [WutheringPity](https://wutheringpity.com/wuthering-waves/37-phase2-events-guide/), which cites Kuro's patch notes. [Official upcoming-events page](https://wutheringwaves.kurogames.com/en/main/news/detail/5653) was discoverable but its body could not be read through the browsing tool.

| Event | Published window | Status on Oct 22 |
| --- | --- | --- |
| Cubie Wars | Sep 30 - Nov 11 | Current |
| Gifts of Waking Moon | Sep 30 - Nov 11 | Current; login |
| Dreams in the Capsule | Sep 30 - Nov 11 | Current |
| Artisan's Search | Oct 8 - 26 | Current |
| Waking Moon Fishing | Oct 15 - Nov 1 | Current; web |
| Back to Solaris | Sep 30 - Nov 11 | Current; return/web campaign |
| Echo Erase | Oct 22 - Nov 9 | Opening/current |
| Gifts of Singing Drizzle | Oct 22 - Nov 11 | Opening/current; login |
| Beyond the Waves: Land of Xuanfang | Oct 29 - Nov 11 | Upcoming |
| Chord Cleansing | Nov 4 - 11 | Upcoming; double drops |

**Bountiful Crescendo** ends Oct 22 at 03:59 server time in that schedule; availability on the research date depends on server/reset time. The older Pocket Tactics page labels September events as current, so those labels were not used as proof of October availability.

Recurring challenges: **Tower of Adversity - Hazard Zone**, **Whimpering Wastes**, **Doubled Pawns Matrix**, and **Fantasies of the Thousand Gateways** (weekly challenges). Sources: [Tower of Adversity](https://game8.co/games/Wuthering-Waves/archives/453474), [Whimpering Wastes](https://game8.co/games/Wuthering-Waves/archives/498614), [Doubled Pawns Matrix](https://game8.co/games/Wuthering-Waves/archives/572518), [weekly/permanent gameplay overview](https://www.pockettactics.com/wuthering-waves/events). The first three are also configured as separate parser sources in this repository; exact current cycle dates should be read from announcements/in-game rather than inferred from their permanent availability.

Existing parser routines: **Daily Activities**, **Weekly Challenge**, and **Shop Reset**. **Bountiful Crescendo** and **Chord Cleansing** recur as limited-window bonus campaigns, not continuous weekly modes.

## Zenless Zone Zero

The [October event schedule](https://www.pockettactics.com/zenless-zone-zero/events) was last updated Oct 9. Its September/early-October current-event labels are stale on Oct 22; the following names/windows can still be extracted without inventing dates:

| Event | Published window | Status on Oct 22 |
| --- | --- | --- |
| Angels Support Operation | Sep 9 - Nov 30 | Current |
| Spooky Funhouse Tales | Version 3.3 | Announced; exact window to confirm |
| Cyber Miracle Healer, on Duty! | Version 3.3 | Announced; exact window to confirm |
| Trails of the Hobbling Crow | Version 3.3 | Announced; exact window to confirm |
| Repair! Drifting Art | Version 3.3 | Announced; exact window to confirm |
| Advanced Bounty: Area Patrol | Version 3.3 | Announced; double drops |
| Data Bounty: Combat Simulation | Version 3.3 | Announced; double drops |

An [official Spooky Funhouse Tales announcement](https://zenless.hoyoverse.com/en-us/news/166946) is indexed on Oct 20, but its article body was not available to the browsing tool. Do not infer an opening date from that publication date.

Recurring combat: **Shiyu Defense - Critical Node**, **Deadly Assault**, **Hollow Zero / Lost Void** weekly bounty objectives. **Notorious Hunt** is a weekly boss/reward activity. Sources: [Shiyu Defense guide](https://www.icy-veins.com/zenless-zone-zero/shiyu-defense), [weekly checklist](https://dailyreset.games/games/zenless-zone-zero/checklist/), [Deadly Assault seasons](https://www.pockettactics.com/zenless-zone-zero/events).

Existing parser reminders: **Errands** (daily), **Notorious Hunt** (weekly), **Signal Shop** (monthly). Returning login and bounty/double-drop campaigns need their own announced windows. Permanent content such as **Endless Tower** should not automatically be assigned a reset just because it appears in an events list.

## Implications for the app's event data

Keep these distinctions when importing or implementing tracking:

- Limited event instance: name, source, game, server/timezone, exact start/end.
- Recurring activity: stable series ID plus separately dated cycles and completion per cycle.
- Routine/shop reset: daily, weekly, monthly, or version-linked task with its own reset rule.
- One-time permanent reward: completion persists and never automatically resets.
- Unknown schedule: retain an explicit unconfirmed status; do not manufacture dates.

The existing parser's `completed` defaults are not authoritative user completion. Preserve the current separation between shared game definitions and account/guest progress. This inventory does not change code, database content, or completion status.
