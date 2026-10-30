import { STORY_CONTENT_TYPES, GAME_STORY_NAMES } from '../../lib/constants/story-content.constants';
import type { StoryContentType } from '../../lib/types/story-content.type';

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
