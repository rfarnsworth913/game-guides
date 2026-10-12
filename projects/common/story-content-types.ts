/** Stable template IDs are stored in game documents; display names may vary by game. */
export const STORY_CONTENT_TYPES = [
    { id: 'patch-overview', title: 'Patch Overview' },
    { id: 'main-story', title: 'Main Story' },
    { id: 'side-stories', title: 'Character / Side Stories' },
    { id: 'world-quests', title: 'World Quests' },
    { id: 'events', title: 'Events' },
    { id: 'lore', title: 'Lore' },
    { id: 'character-information', title: 'Character Information' },
] as const;

export type StoryContentType = typeof STORY_CONTENT_TYPES[number]['id'];

/** Add game terminology here without changing templates, topic colors, or saved categories. */
export const GAME_STORY_NAMES: Readonly<Record<string, Partial<Record<StoryContentType, string>>>> = {
    genshin: { 'main-story': 'Archon Quest', 'side-stories': 'Story Quest' },
    hsr: { 'main-story': 'Trailblaze Mission' },
};

export function storyContentName(game: string, type: StoryContentType): string {
    return GAME_STORY_NAMES[game]?.[type] ?? STORY_CONTENT_TYPES.find((item) => item.id === type)!.title;
}

export function storyContentTypes(game: string) {
    return STORY_CONTENT_TYPES.map((type) => ({
        id: type.id,
        title: storyContentName(game, type.id),
        templateTitle: type.title,
    }));
}
