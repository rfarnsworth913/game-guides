import { storyProgress } from './story-progress';
import { Entry } from './workspace.store';
import { emptyPatchOverview } from '../../../../common/story-template';

describe('story completion', () => {
    it('counts quest rows and standalone entries but excludes headings and global notes', () => {
        const row = { contentType: '', content: '', patch: '', notes: '' };
        const entry: Entry = {
            id: 'test', game: 'genshin', kind: 'story', name: 'Test', notes: '', quantity: 0,
            target: 0, rarity: 0, members: [], requirements: [], completed: false, order: 0, day: '',
            category: 'world-quests', storyRowCompletion: { a: true, heading: true },
            worldQuests: { ...emptyPatchOverview(), rows: [
                { ...row, id: 'a' }, { ...row, id: 'b', subQuest: true },
                { ...row, id: 'heading', rowType: 'heading' }, { ...row, id: 'note', rowType: 'note' },
            ] },
        };
        expect(storyProgress([entry])).toEqual({ total: 2, completed: 1, percent: 50 });
        const event: Entry = { ...entry, category: 'events', worldQuests: undefined, eventStory: entry.worldQuests };
        expect(storyProgress([event])).toEqual({ total: 2, completed: 1, percent: 50 });
        const lore: Entry = { ...entry, category: 'lore', worldQuests: undefined, lore: entry.worldQuests };
        expect(storyProgress([lore])).toEqual({ total: 2, completed: 1, percent: 50 });
        expect(storyProgress([])).toEqual({ total: 0, completed: 0, percent: 0 });
    });
});
