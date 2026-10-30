import type { StoryContext } from './story-context.type';
import type { StoryGroup } from './story-group.type';

export type StoryTableRow = {
    context?: StoryContext;
    id: string;
    subQuest?: boolean;
    rowType?: 'quest' | 'heading' | 'note';
    groupId?: string;
    contentUrl?: string;
    contentType: string;
    content: string;
    patch: string;
    notes: string;
    notesRight?: string;
};
export type PatchOverview = {
    context?: StoryContext;
    imagePositionX?: number;
    imagePositionY?: number;
    characterName?: string;
    damageType?: string;
    damageTypeIcon?: string;
    faction?: string;
    factionIcon?: string;
    region?: string;
    subtitle?: string;
    versionImageUrl?: string;
    patchVersion?: string;
    patchTitle?: string;
    releaseDate?: string;
    summary?: string;
    groups?: StoryGroup[];
    imageUrl: string;
    imageAlt: string;
    sourceName: string;
    sourceUrl: string;
    rows: StoryTableRow[];
};
