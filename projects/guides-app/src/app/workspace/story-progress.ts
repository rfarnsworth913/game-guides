import { Entry } from './workspace.store';

export function storyTemplate(entry: Entry) {
    return entry.category === 'patch-overview' ? entry.patchOverview
        : entry.category === 'main-story' ? entry.mainStory
        : entry.category === 'events' ? entry.eventStory
        : entry.category === 'side-stories' ? entry.sideStories
        : entry.category === 'character-information' ? entry.characterInformation
        : entry.category === 'lore' ? entry.lore
        : entry.category === 'world-quests' ? entry.worldQuests : undefined;
}

export function storyProgress(entries: Entry[]) {
    let total = 0;
    let completed = 0;
    for (const entry of entries) {
        const template = storyTemplate(entry);
        if (['patch-overview', 'main-story', 'side-stories', 'world-quests', 'lore', 'character-information', 'events'].includes(entry.category)) {
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
