import { Entry } from './workspace.store';
import { storyProgress, storyTemplate } from './story-progress';
import { StoryPosition } from './story-position.store';
import { storyRowDone } from '../../../../common/story-guide';

export function storyDashboard(entries: Entry[], game: string, position?: StoryPosition) {
    const sections = entries.filter(e => e.game === game && e.kind === 'story-category').sort(ordered);
    const stories = sections.flatMap(section => entries.filter(e => e.game === game && e.kind === 'story' && e.storySection === section.id).sort(ordered));
    const progress = storyProgress(stories);
    const next = stories.find(entry => { const value = storyProgress([entry]); return value.completed < value.total; });
    const visited = stories.find(entry => entry.id === position?.entryId);
    const resume = visited ?? next ?? stories[0];
    const section = sections.find(section => section.id === resume?.storySection);
    const rows = resume ? storyTemplate(resume)?.rows.filter(row => !row.rowType || row.rowType === 'quest') ?? [] : [];
    const row = (visited && rows.find(row => row.id === position?.rowId)) || rows.find(row => resume && !storyRowDone(resume, row));
    const nextRow = rows.find(row => resume && !storyRowDone(resume, row));
    return {
        game, ...progress, resume, section, row, nextRow, visitedAt: visited ? position?.visitedAt ?? 0 : 0,
        lastLocation: visited ? [section?.name, visited.name, position?.rowId && rows.find(row => row.id === position.rowId)?.content].filter(Boolean).join(' / ') : '',
        fragment: resume ? row ? `story-row-${resume.id}-${row.id}` : `${storyTemplate(resume) ? 'story-template' : 'story-content'}-${resume.id}` : undefined,
        action: visited ? 'Resume guide' : next ? 'Start guide' : progress.total ? 'Review guide' : 'Open guide',
    };
}

function ordered(a: Entry, b: Entry): number { return a.order - b.order || a.name.localeCompare(b.name); }
