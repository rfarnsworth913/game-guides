# Main quest groups

Main Story templates now separate the overarching quest from the quests that make it up. The heading links to the overarching quest; each quest below it has an ordinary checkbox and no sub-quest indentation. Only those quest rows count toward completion.

Character / Side Stories use the same heading, progress count/percentage, regular quest rows, collapse animation, and editor controls. Their labels remain game-specific: Story Quest in Genshin Impact, Operator Mission in Arknights: Endfield, and Agent Story in Zenless Zone Zero. Their own category colors are retained. The existing `sideStories` payload is retained; it uses the same `groups[].mainQuest` parent field as Main Story rather than renaming saved records.

For example, **Everwinter Without Mercy** is the linked heading, and its four quests are regular rows. The heading is no longer a fifth checkbox.

## Stored structure

The existing `mainStory` template and its group IDs remain in place. A group can now include `mainQuest`, containing the complete original parent record:

```ts
{
    groups: [{
        id: 'existing-group-id',
        title: 'Everwinter Without Mercy',
        defaultPatch: '7.0',
        mainQuest: {
            id: 'existing-parent-row-id',
            groupId: 'existing-group-id',
            contentType: '',
            content: 'Everwinter Without Mercy',
            contentUrl: 'https://genshin-impact.fandom.com/wiki/Everwinter_Without_Mercy',
            patch: '7.0',
            notes: '',
        },
    }],
    rows: [{
        id: 'existing-quest-row-id',
        groupId: 'existing-group-id',
        contentType: '',
        content: 'Into the Wind, Into the Frigid North',
        patch: '7.0',
        notes: '',
        subQuest: false,
    }],
}
```

All parent fields, including notes, split notes, links, and optional context, move intact. Child IDs, order, links, and notes remain unchanged. Main quest headings retain their former row anchors so existing deep links still resolve. Search includes the parent record.

Player progress maps are not rewritten. Existing quest checks continue to use the same IDs. The former parent checkbox key is retained for recovery but is excluded from progress totals; percentages can change because the parent is no longer counted as a separate task.

## Editing

In a Main Story subsection, groups have **Main Quest Title** and **Main Quest Link** fields. **Main quest details** retains the parent's notes and context. The **Quests** section below supports standard content, links, patch exceptions, notes, and ordering. The Sub-quest checkbox is hidden for Main Story templates.

- **Add Main Quest** creates a heading and its quest group.
- **Use as Main Quest** promotes an existing row. If another parent already exists, that previous record returns to the regular rows instead of being discarded.
- Removing a group returns both its parent and its quests to Overview, retaining their records.
- All dialog changes remain drafts until the section is saved.
- Existing media-only groups are preserved. The migration does not infer that a trailer or cutscene is an overarching quest.

## Backup and applied migration

Before changing data, a verified full database export was created at:

`backups/main-quests-2026-10-23T19-51-43-123Z-304a87d2/`

The backup contains **9 collections and 33 documents**, including player progress, plus index definitions. `manifest.ejson` records document counts and SHA-256 hashes; collection files use MongoDB Extended JSON. The original backup files remain unchanged. The folder is excluded from Git because the export includes private account data.

The applied migration updated:

| Game | Guides updated | Parent records moved | Quest indent flags normalized |
| --- | ---: | ---: | ---: |
| Genshin Impact | 22 | 22 | 131 |
| Arknights: Endfield | 13 | 13 | 72 |
| Zenless Zone Zero | 7 | 7 | 22 |
| Neverness to Everness | 5 | 5 | 0 |
| Total | 47 | 47 | 225 |

Only each affected game's `story` field and revision changed. Other content, parser records, and player collections were not modified. Media groups such as Trailers, Cutscenes, and EPs were retained. The migration verifies every record ID and payload before writing and reads back each changed game afterward. `migration-journal.ndjson` in the backup folder lists completed games and their resulting revisions.

Refresh an open story guide to load the revised catalog. An editor with a stale draft may need to reopen it because the catalog revisions changed.

## Maintenance commands

```powershell
# Creates and verifies a new full database export; no database changes.
npm run middleware:main-quests -- --backup

# Checks all backup files and previews the conversion; no database changes.
npm run middleware:main-quests -- --plan backups/<backup-directory>

# Requires the verified backup and rejects game changes since it was created.
npm run middleware:main-quests -- --apply backups/<backup-directory>
```

The conversion is repeatable: records already moved into headings are not moved again. Applying against the original backup recognizes games already converted at the expected revision. A subsequent editor change requires a fresh backup instead of overwriting that change. Restore, if needed, should use the original Extended JSON and account for changes made since the backup; the migration never performs an automatic restore.

## Character quest conversion

The character quest conversion uses a separate verified backup:

`backups/main-quests-2026-10-23T23-16-21-583Z-040dd6b4/`

The applied character quest conversion updated 73 guides: 54 in Genshin Impact, 9 in Arknights: Endfield, 6 in Zenless Zone Zero, and 4 in Neverness to Everness. It promoted 73 parent records and normalized 201 quest indentation flags without changing player progress. An earlier attempt stopped during preflight after detecting an intervening editor change; the applied conversion uses the fresh backup above, which includes those latest edits.

Append `--character-quests` to the planning or application command to process only Character / Side Stories. Main Story definitions and unrelated templates are not changed by that mode.

```powershell
npm run middleware:main-quests -- --plan backups/<backup-directory> --character-quests
npm run middleware:main-quests -- --apply backups/<backup-directory> --character-quests
```

Existing parent records move intact, child indentation flags are cleared, and old completion keys remain private and untouched. Reward groups and media groups remain separate. A meeting-point heading such as `Tidesong Cavern: Quests` is recognized as the overarching record for Tidesong Cavern, while its exploration rewards remain independently trackable.
