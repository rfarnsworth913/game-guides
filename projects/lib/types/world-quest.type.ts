import type { StoryTableRow } from './story-template.type';
export type WorldQuestGroupType = 'region' | 'questChain' | 'collectionChecklist';

export type WorldQuestSection = {
    id: string;
    title: string;
    heading?: StoryTableRow;
    rows: Array<StoryTableRow>;
};

export type WorldQuestGroup = {
    id: string;
    title: string;
    contentUrl?: string;
    mode: WorldQuestGroupType;
    sections: Array<WorldQuestSection>;
    rows: Array<StoryTableRow>;
};
