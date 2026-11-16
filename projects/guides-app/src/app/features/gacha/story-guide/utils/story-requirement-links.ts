import type { Entry } from '../../../../../../../lib/types/workspace.type';
import { isStoryDivider, storyTemplateFor } from '../../../../../../../common/quests/story-guide';

export type RequirementLink = { id: string; name: string; detail: string; url: string };

/** References reuse existing records and anchors, never completion records. */
export function storyRequirementLinks(entries: Entry[], game: string): RequirementLink[] {
    const links: RequirementLink[] = [];
    for (const entry of entries.filter(item => item.game === game && !isStoryDivider(item))) {
        const base = `/games/${encodeURIComponent(game)}/`;
        const url = entry.kind === 'story' ? `${base}story?section=${encodeURIComponent(entry.storySection ?? '')}` : `${base}${entry.kind === 'achievement-category' ? 'achievements' : entry.kind}`;
        if (entry.name.trim()) {
            links.push({ id: entry.id, name: entry.name, detail: entry.category || entry.kind, url: url + (entry.kind === 'story' ? `#story-content-${encodeURIComponent(entry.id)}` : '') });
        }
        const template = storyTemplateFor(entry);
        for (const row of [...template?.rows ?? [], ...template?.groups?.flatMap(group => group.mainQuest ? [group.mainQuest] : []) ?? []]) {
            if (row.rowType === 'heading' || row.rowType === 'note' || !row.content.trim()) {continue;}
            const id = `quest:${encodeURIComponent(entry.id)}:${encodeURIComponent(row.id)}`.replaceAll('.', '%2E');
            // Stay within the existing persisted requirement identifier limit.
            if (id.length > 100) {continue;}
            const group = template?.groups?.find(group => group.id === row.groupId);
            links.push({ id, name: row.content, detail: [entry.name, group?.title].filter(Boolean).join(' / '), url: `${url}#story-row-${encodeURIComponent(entry.id)}-${encodeURIComponent(row.id)}` });
        }
    }
    return links.sort((a, b) => a.name.localeCompare(b.name) || a.detail.localeCompare(b.detail));
}
