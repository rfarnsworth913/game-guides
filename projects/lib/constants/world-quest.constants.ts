import type { WorldQuestGroupType } from '@lib/types/world-quest.type';

/** Stable IDs retain existing region and quest-chain data without a migration. */
export const WORLD_QUEST_GROUP_TYPES: ReadonlyArray<{ id: WorldQuestGroupType; label: string }> = [
    { id: 'region', label: 'Area Exploration' },
    { id: 'questChain', label: 'Quest Chain' },
    { id: 'collectionChecklist', label: 'Collection Checklist' },
];

/** Suggested classifications; editors can also enter game-specific subtype names. */
export const WORLD_QUEST_SUBTYPES = new Map([
    ["standard", "Standard Quest"],

    ["dailyGated", "Daily Gated"],
    ["hiddenExploration", "Hidden Exploration"],
    ["meetingPoint", "Meeting Point"],
    ["questStage", "Quest Stage"],
    ["repeatable", "Repeatable"],
]);
