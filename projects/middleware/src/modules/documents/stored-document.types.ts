import type { CatalogEntry } from '../../../../lib/types/workspace.type';
import type { PatchOverview } from '../../../../lib/types/story-template.type';

/** Legacy database fields remain open so migrations preserve unrecognized data. */
export type StoredAchievementRow = {
    [key: string]: unknown;
    _id?: unknown;
    title?: string;
    order?: number | string;
    icon?: string;
    reward?: string;
    rewardIcon?: string;
    description?: string;
    url?: string;
    notes?: string;
    requirements?: string;
};
export type StoredAchievement = StoredAchievementRow & { achievements: Array<StoredAchievementRow> };

export type StoredStory = {
    [key: string]: unknown;
    kind?: string;
    game?: string;
    category: {
        [key: string]: unknown;
        _id?: unknown;
        title: string;
        order: number;
        icon?: string;
        imageUrl?: string;
        content: {
            [key: string]: unknown;
            subsections: Array<CatalogEntry & Record<string, unknown>>;
        };
    };
};

export type StoredEvent = Record<string, unknown> & {
    title?: string;
    url?: string;
    icon?: string;
    eventType?: string;
};

export type StoredGameDocument = Record<string, unknown> & {
    story?: Array<StoredStory>;
    achievements?: Array<StoredAchievement>;
    events?: Array<StoredEvent>;
    characters?: Array<CatalogEntry>;
    inventory?: Array<CatalogEntry>;
    plans?: Array<CatalogEntry>;
    teams?: Array<CatalogEntry>;
    catalog?: Record<string, Array<CatalogEntry>> & { revision?: number };
    version?: Record<string, unknown>;
};

export type StoredQuestEntry = Record<string, unknown> & {
    id?: string;
    name: string;
    category: string;
    mainStory?: PatchOverview;
    sideStories?: PatchOverview;
};
