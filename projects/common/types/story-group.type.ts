import type { StoryTableRow } from '../story-template';

export type StoryGroup = {
    id: string;
    title: string;
    defaultPatch?: string;
    /** The overarching main or character quest is a linked heading, not an extra task. */
    mainQuest?: StoryTableRow;
};
