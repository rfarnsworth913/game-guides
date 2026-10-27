import { storyContentName, storyContentTypes } from '../../../../common/story-content-types';

describe('game story terminology', () => {
    it('maps game names while retaining stable category IDs', () => {
        expect(storyContentName('genshin', 'character-information')).toBe('Character Info');
        expect(storyContentName('endfield', 'character-information')).toBe('Operator Info');
        expect(storyContentName('genshin', 'side-stories')).toBe('Story Quest');
        expect(storyContentName('genshin', 'main-story')).toBe('Archon Quest');
        expect(storyContentName('hsr', 'main-story')).toBe('Trailblaze Mission');
        expect(storyContentTypes('hsr').find((type) => type.id === 'main-story')).toEqual({
            id: 'main-story', title: 'Trailblaze Mission', templateTitle: 'Main Story',
        });
    });
    it('falls back to shared names for unmapped games and content types', () => {
        expect(storyContentName('endfield', 'main-story')).toBe('Main Mission');
        expect(storyContentName('wuwa', 'main-story')).toBe('Main Story');
        expect(storyContentName('genshin', 'world-quests')).toBe('World Quests');
        expect(storyContentName('unknown', 'patch-overview')).toBe('Patch Overview');
    });
});
