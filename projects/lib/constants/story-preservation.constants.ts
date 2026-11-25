/** Only optional presentation fields may be removed from a story's shared projections. */
export const REMOVABLE_STORY_FIELDS = [
    'characterName', 'damageType', 'damageTypeIcon', 'faction', 'factionIcon',
    'versionImageUrl', 'patchTitle', 'releaseDate',
    ...['trackingMode', 'availability', 'startDate', 'endDate', 'cycleId', 'resetSchedule',
        'chapter', 'region', 'area', 'chain', 'subtype', 'difficulty', 'requirements', 'prerequisites',
        'requirementsOperator', 'relatedContentIds'].map(key => `context.${key}`),
] as const;
