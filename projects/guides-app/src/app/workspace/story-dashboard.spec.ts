import { storyDashboard } from './story-dashboard';
import { Entry } from './workspace.store';
import { emptyPatchOverview } from '../../../../common/story-template';

const section: Entry = { id: 'region', game: 'endfield', kind: 'story-category', name: 'Valley IV', category: '', order: 0,
    notes: '', completed: false, quantity: 0, target: 0, rarity: 0, members: [], requirements: [], day: '' };
const quest: Entry = { ...section, id: 'mission', name: 'First Mission', kind: 'story', storySection: section.id, category: 'main-story',
    mainStory: { ...emptyPatchOverview(), rows: [
        { id: 'heading', rowType: 'heading', content: 'Heading', contentType: '', patch: '', notes: '' },
        { id: 'a', content: 'First task', contentType: '', patch: '1.0', notes: '' },
        { id: 'b', content: 'Second task', contentType: '', patch: '1.0', notes: '' },
        { id: 'note', rowType: 'note', content: '', contentType: '', patch: '', notes: 'Note' },
    ] }, storyRowCompletion: { a: true } };

describe('Dashboard story summaries', () => {
    it('counts content rows, excludes headings/notes, and stays within the requested game', () => {
        const result = storyDashboard([section, quest, { ...quest, id: 'other-game', game: 'genshin' }], 'endfield');
        expect(result).toMatchObject({ total: 2, completed: 1, percent: 50, action: 'Start guide', row: { id: 'b' } });
        expect(result.fragment).toBe('story-row-mission-b');
    });
    it('resumes the saved row even if completed, and identifies the next incomplete row', () => {
        const result = storyDashboard([section, quest], 'endfield', { entryId: quest.id, rowId: 'a', visitedAt: 123 });
        expect(result.lastLocation).toBe('Valley IV / First Mission / First task');
        expect(result).toMatchObject({ action: 'Resume guide', visitedAt: 123, row: { id: 'a' }, nextRow: { id: 'b' } });
    });
    it('falls back safely after a saved section or row is deleted', () => {
        const missing = storyDashboard([section, quest], 'endfield', { entryId: 'deleted', visitedAt: 123 });
        expect(missing.lastLocation).toBe('');
        expect(missing.row?.id).toBe('b');
        const missingRow = storyDashboard([section, quest], 'endfield', { entryId: quest.id, rowId: 'deleted', visitedAt: 123 });
        expect(missingRow.fragment).toBe('story-row-mission-b');
    });
    it('handles empty and fully completed guides without suggesting a new quest', () => {
        expect(storyDashboard([], 'endfield')).toMatchObject({ total: 0, completed: 0, percent: 0, action: 'Open guide' });
        const result = storyDashboard([section, { ...quest, storyRowCompletion: { a: true, b: true } }], 'endfield');
        expect(result).toMatchObject({ total: 2, completed: 2, percent: 100, action: 'Review guide' });
        expect(result.nextRow).toBeUndefined();
    });
});
