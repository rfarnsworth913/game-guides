import type { StoryTableRow } from '@lib/types/story-template.type';
import type { WorldQuestGroupType } from '@lib/types/world-quest.type';

export type StoryGroup = {
    id: string;
    title: string;

    /** Optional external destination for the group's title. */
    contentUrl?: string;
    defaultPatch?: string;

    /** Content groups hold related media or references without an overarching quest. */
    groupType?: "quest" | "content";

    /** World Quest organization; omitted legacy groups display as regions. */
    worldQuestMode?: WorldQuestGroupType;

    /** Additional memberships reference canonical rows, never copies of player progress. */
    objectiveIds?: Array<string>;

    /** The overarching main or character quest is a linked heading, not an extra task. */
    mainQuest?: StoryTableRow;
};
