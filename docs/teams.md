# Personal teams

Open **Teams** within a game to create, edit, and delete personal teams. Pick one or more owned characters from that game's collection. Name the team and optionally add notes; selection order determines member order. Partial teams are supported.

An editor configures **Maximum team size** in **Characters → Game rules** (1–12). Existing rules without this setting use four slots as a starting value. No game-specific capacity presets are assumed.

Teams belong to the player, not the shared catalog. They use the existing account progress API or guest browser storage under the reserved `<game>/@teams` key. Non-editors can create teams. The server verifies ownership, game membership, duplicate members, and capacity. Deleting a team leaves the character collection unchanged.

If a member is removed from the collection or a size limit is reduced, existing teams remain visible. Their next edit must resolve unavailable members or excess capacity. Existing shared catalog team records are preserved separately; they are not silently assigned to personal collections.

JSON exports include `personalTeams`. Import restores valid teams after collection data, and the explicit guest-progress import includes eligible guest teams without replacing existing account teams with the same ID.
