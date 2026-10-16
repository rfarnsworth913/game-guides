import { Entry } from './workspace.store';
import { storyContentTypes } from '../../../../common/story-content-types';

export type StorySearchResult = {
    id: string;
    title: string;
    context: string;
    excerpt: string;
    sectionId: string;
    target: string;
};

export function searchStoryGuides(entries: Entry[], game: string, query: string): StorySearchResult[] {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const matches = (values: (string | undefined)[]) => {
        const text = values.filter(Boolean).join(' ').toLocaleLowerCase();
        return terms.every((term) => text.includes(term));
    };
    const sections = entries.filter((entry) => entry.game === game && entry.kind === 'story-category')
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const topics = storyContentTypes(game);
    const results: StorySearchResult[] = [];
    for (const section of sections) {
        if (matches([section.name, section.notes])) results.push({ id: section.id, title: section.name,
            context: 'Navigation Category', excerpt: section.notes, sectionId: section.id, target: 'story-section-content' });
        const content = entries.filter((entry) => entry.game === game && entry.kind === 'story' && entry.storySection === section.id)
            .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
        for (const entry of content) {
            const topic = topics.find((topic) => topic.id === entry.category)?.title ?? entry.category;
            const template = entry.category === 'patch-overview' ? entry.patchOverview
                : entry.category === 'main-story' ? entry.mainStory
                : entry.category === 'side-stories' ? entry.sideStories
                : entry.category === 'events' ? entry.eventStory
                : entry.category === 'lore' ? entry.lore
            : entry.category === 'world-quests' ? entry.worldQuests
                : entry.category === 'character-information' ? entry.characterInformation : undefined;
            const metadata = template ? Object.values(template).filter((value): value is string => typeof value === 'string') : [];
            if (matches([entry.name, entry.notes, entry.description, entry.wikiUrl, topic, ...metadata])) {
                results.push({ id: entry.id, title: entry.name, context: `${section.name} / ${topic}`,
                    excerpt: entry.notes || template?.summary || template?.characterName || '', sectionId: section.id,
                    target: template ? `story-template-${entry.id}` : `story-content-${entry.id}` });
            } else {
                for (const row of template?.rows ?? []) {
                    const group = template?.groups?.find((group) => group.id === row.groupId);
                    if (!matches([row.content, row.contentUrl, row.contentType, row.patch, row.notes, row.notesRight, group?.title, group?.defaultPatch])) continue;
                    results.push({ id: `${entry.id}/${row.id}`, title: row.content || (row.rowType === 'note' ? 'Global Notes' : 'Content row'),
                        context: [section.name, entry.name, group?.title, row.patch && `Patch ${row.patch}`].filter(Boolean).join(' / '),
                        excerpt: [row.notes, row.notesRight, row.contentUrl].filter(Boolean).join(' · '), sectionId: section.id,
                        target: `story-row-${entry.id}-${row.id}` });
                }
            }
        }
    }
    return results;
}
