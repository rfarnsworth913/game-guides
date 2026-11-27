import type { StoryContext } from '@lib/types/story-context.type';
import type { StoryGroup } from '@lib/types/story-group.type';

export type StoryTableRow = {
    context?: StoryContext;
    id: string;
    subQuest?: boolean;
    optional?: boolean;
    rowType?: 'quest' | 'heading' | 'note';
    groupId?: string;
    contentUrl?: string;
    thumbnailUrl?: string;
    duration?: string;
    contentType: string;
    content: string;
    patch: string;
    notes: string;
    notesRight?: string;
};
export type PatchOverview = {
    /** Distinct, pre-existing legacy template drafts retained during conversion. */
    preservedTemplates?: { template: string; content: Omit<PatchOverview, 'preservedTemplates'> }[];
    /** Retained title when a decorative presentation hides its section name. */
    title?: string;
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
