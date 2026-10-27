import { searchStoryGuides } from './story-search';
import { Entry } from './workspace.store';
import { emptyPatchOverview } from '../../../../common/story-template';

describe('game-wide story search', () => {
    const section: Entry = { id: 'valley', game: 'endfield', kind: 'story-category', name: 'Valley IV',
        notes: '', category: '', completed: false, quantity: 0, target: 0, order: 0, rarity: 0, day: '', members: [], requirements: [] };
    const row = { id: 'operator', groupId: 'lore', content: 'Operator Profile', contentType: '', patch: '1.1',
        contentUrl: 'https://example.com/wulfgard', notes: 'Requires **friendship**', notesRight: 'Rhodes Island' };
    const info: Entry = { ...section, id: 'info', kind: 'story', name: 'Operator Info', storySection: section.id,
        category: 'character-information', characterInformation: { ...emptyPatchOverview(), characterName: 'Wulfgard',
            groups: [{ id: 'lore', title: 'Operator Lore' }], rows: [row] } };
    const secondSection = { ...section, id: 'wuling', name: 'Wuling', order: 1 };
    const event: Entry = { ...info, id: 'event', storySection: secondSection.id, category: 'events', name: 'Festival',
        eventStory: { ...emptyPatchOverview(), rows: [{ ...row, id: 'event-row', content: 'Festival reward', notes: 'Secret route' }] } };

    it('finds titles, Markdown notes, split notes, links, patches, groups and character details', () => {
        for (const query of ['profile', 'friendship', 'rhodes', 'example.com/wulfgard', '1.1', 'operator lore', 'wulfgard']) {
            expect(searchStoryGuides([section, info], 'endfield', query).length).toBeGreaterThan(0);
        }
        expect(searchStoryGuides([section, info], 'endfield', ' FRIENDSHIP ')[0].target).toBe('story-row-info-operator');
    });
    it('searches other navigation categories, limits results to the game and requires all search terms', () => {
        const foreignSection = { ...section, id: 'foreign', game: 'genshin' };
        const foreign = { ...event, game: 'genshin', id: 'foreign-event', storySection: foreignSection.id };
        const entries = [section, info, secondSection, event, foreignSection, foreign];
        expect(searchStoryGuides(entries, 'endfield', 'secret route').map((result) => result.id)).toEqual(['event/event-row']);
        expect(searchStoryGuides(entries, 'endfield', 'secret absent')).toEqual([]);
        expect(searchStoryGuides(entries, 'endfield', '   ')).toEqual([]);
    });
});
