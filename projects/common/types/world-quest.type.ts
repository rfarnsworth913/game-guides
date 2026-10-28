import type { StoryTableRow } from "../story-template";

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
    mode: "region" | "questChain";
    sections: Array<WorldQuestSection>;
    rows: Array<StoryTableRow>;
};
