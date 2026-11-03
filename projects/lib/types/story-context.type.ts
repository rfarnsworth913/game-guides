import type { StoryAvailability, StoryRequirementType, StoryTrackingMode } from '../enums/story-tracking.enum';

/** Optional additions to the existing records. Legacy IDs and completion keys stay unchanged. */
export type StoryContext = {
    trackingMode?: StoryTrackingMode;
    availability?: StoryAvailability;
    startDate?: string;
    endDate?: string;
    cycleId?: string;
    resetSchedule?: string;
    chapter?: string;
    region?: string;
    area?: string;
    chain?: string;
    subtype?: string;
    difficulty?: string;
    requirements?: { type: StoryRequirementType; text: string; targetId?: string }[];
    /** Undefined/null means undocumented; an explicit empty list means no prerequisites. */
    prerequisites?: { type: StoryRequirementType; text: string; targetId?: string }[] | null;
    requirementsOperator?: 'allOf' | 'anyOf';
    relatedContentIds?: string[];
};
