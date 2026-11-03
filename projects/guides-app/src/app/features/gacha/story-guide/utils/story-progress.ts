import { Entry } from "../../../../core/state/workspace.store";
import { storyRowDone, storyTemplateFor } from "../../../../../../../common/quests/story-guide";

export function storyTemplate(entry: Entry) {
    return storyTemplateFor(entry);
}

export function storyProgress(entries: Entry[]) {
    let total = 0;
    let completed = 0;
    for (const entry of entries) {
        const template = storyTemplate(entry);
        if (['patch-overview', 'main-story', 'side-stories', 'world-quests', 'lore', 'character-information', 'events', 'endgame-activity'].includes(entry.category)) {
            for (const row of template?.rows ?? []) {
                if (row.rowType === 'heading' || row.rowType === 'note') {continue;}
                total++;
                if (storyRowDone(entry, row)) {completed++;}
            }
        } else {
            total++;
            if (entry.completed) {completed++;}
        }
    }
    return { total, completed, percent: total ? Math.round(completed / total * 100) : 0 };
}
