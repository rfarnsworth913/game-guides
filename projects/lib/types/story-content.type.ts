import type { STORY_CONTENT_TYPES } from '../constants/story-content.constants';

export type StoryContentType = typeof STORY_CONTENT_TYPES[number]['id'];
