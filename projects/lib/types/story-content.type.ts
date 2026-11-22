import type { STORY_CONTENT_TYPES } from '@lib/constants/story-content.constants';

export type StoryContentType = typeof STORY_CONTENT_TYPES[number]['id'];
