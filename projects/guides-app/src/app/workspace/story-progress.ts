import { Entry } from './workspace.store';

export function storyProgress(entries: Entry[]) {
    let total = 0;
    let completed = 0;
    for (const entry of entries) {
        const template = entry.category === 'patch-overview' ? entry.patchOverview
            : entry.category === 'main-story' ? entry.mainStory
            : entry.category === 'side-stories' ? entry.sideStories
            : entry.category === 'world-quests' ? entry.worldQuests : undefined;
        if (['patch-overview', 'main-story', 'side-stories', 'world-quests'].includes(entry.category)) {
            for (const row of template?.rows ?? []) {
                if (row.rowType === 'heading' || row.rowType === 'note') continue;
                total++;
                if (entry.storyRowCompletion?.[row.id]) completed++;
            }
        } else {
            total++;
            if (entry.completed) completed++;
        }
    }
    return { total, completed, percent: total ? Math.round(completed / total * 100) : 0 };
}
