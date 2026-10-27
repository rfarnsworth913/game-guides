import { patchGroups, PatchOverview, preparePatchGroups, StoryTableRow } from './story-template';

/** Pure, repeatable conversion. Parent records move intact; no content or progress key is deleted. */
export function reworkMainQuestTemplate(source: PatchOverview, title: string): { template: PatchOverview; promoted: number; normalized: number; review: string[] } {
    const template = structuredClone(source);
    preparePatchGroups(template);
    const review: string[] = [];
    let promoted = 0;
    let normalized = 0;
    const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    // Preserve older ungrouped records by creating an explicit group only when there are rows.
    if (template.rows.some(row => !row.groupId)) {
        let id = 'main-quest-overview';
        while (template.groups!.some(group => group.id === id)) id += '-legacy';
        template.groups!.push({ id, title });
        for (const row of template.rows) if (!row.groupId) row.groupId = id;
    }
    for (const group of patchGroups(template)) {
        const savedGroup = template.groups!.find(item => item.id === group.id);
        if (!savedGroup) continue;
        if (savedGroup.groupType === 'content') continue;
        if (!savedGroup.mainQuest) {
            const quests = group.rows.filter(row => !row.rowType || row.rowType === 'quest');
            const first = quests[0];
            const parentTitle = first?.content.replace(/:\s*quests?\s*$/i, '') ?? '';
            const matchesTitle = first && [group.title, title].some(value => normalize(value) === normalize(parentTitle));
            if (first && matchesTitle) {
                savedGroup.mainQuest = first;
                template.rows = template.rows.filter(row => row.id !== first.id);
                promoted++;
            } else if (quests.length) review.push(group.title);
        }
        for (const row of template.rows.filter(row => row.groupId === group.id)) {
            if (row.subQuest) { row.subQuest = false; normalized++; }
        }
    }
    return { template, promoted, normalized, review };
}

/** All stored row records, including non-trackable parent headings, for lossless checks. */
export function mainQuestRecords(template: PatchOverview): StoryTableRow[] {
    return [...template.rows, ...(template.groups ?? []).flatMap(group => group.mainQuest ? [group.mainQuest] : [])];
}
