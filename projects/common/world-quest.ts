import { httpUrl, patchGroups, type PatchOverview, type StoryTableRow } from './story-template';
import type { StoryContext } from './story-guide';
import { StoryRequirementType } from './enums/story-tracking.enum';
import type { WorldQuestGroup, WorldQuestSection } from './types/world-quest.type';

export function worldQuestObjectives(rows: StoryTableRow[]): StoryTableRow[] {
    return [...new Map(rows.filter(row => !row.rowType || row.rowType === 'quest').map(row => [row.id, row])).values()];
}

/** A read-only adapter: legacy headings, notes, objective IDs and release versions are retained. */
export function worldQuestGroups(data: PatchOverview): WorldQuestGroup[] {
    const objectives = new Map(worldQuestObjectives(data.rows).map(row => [row.id, row]));
    return patchGroups(data).map(group => {
        const rows = [...new Map([...group.rows, ...(group.objectiveIds ?? []).flatMap(id => objectives.get(id) ? [objectives.get(id)!] : [])].map(row => [row.id, row])).values()];
        const mode = group.worldQuestMode ?? 'region';
        const sections: WorldQuestSection[] = [];
        let section: WorldQuestSection | undefined;
        for (const row of rows) {
            if (row.rowType === 'heading') {
                section = { id: row.id, title: row.content, heading: row, rows: [] };
                sections.push(section);
                continue;
            }
            const title = mode === 'questChain' ? row.context?.chapter : row.context?.area;
            if (title && (!section || section.title !== title)) {
                section = { id: `area:${row.id}`, title, rows: [] };
                sections.push(section);
            }
            if (!title && section?.title && !section.heading && (!row.rowType || row.rowType === 'quest')) {
                section = undefined;
            }
            if (!section) {
                section = { id: `direct:${group.id}:${row.id}`, title: '', rows: [] };
                sections.push(section);
            }
            section.rows.push(row);
        }
        for (const child of sections) {
            const quests = worldQuestObjectives(child.rows);
            if (!httpUrl(child.heading?.contentUrl ?? '') && quests.length === 1 && child.title.trim().toLocaleLowerCase() === quests[0].content.trim().toLocaleLowerCase()) {
                child.title = '';
            }
        }
        return { id: group.id, title: group.title, contentUrl: group.contentUrl, mode, sections, rows };
    });
}

/** Only existing structured gates are eligible for the legacy fallback. Notes are never parsed. */
export function worldQuestPrerequisites(context?: StoryContext): NonNullable<StoryContext['prerequisites']> | null {
    if (context?.prerequisites !== undefined) {
        return context.prerequisites;
    }
    const gates = context?.requirements?.filter(requirement => [StoryRequirementType.Prerequisite, StoryRequirementType.Unlock, StoryRequirementType.TimeGate].includes(requirement.type));
    return gates?.length ? gates : null;
}
