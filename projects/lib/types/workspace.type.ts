import type { PatchOverview } from './story-template.type';
import type { Team } from './team.type';
import type { CharacterCollection, CharacterDefinition, CharacterRules } from './character.type';

export type Kind =
    | 'inventory'
    | 'characters'
    | 'teams'
    | 'plans'
    | 'story'
    | 'events'
    | 'achievements'
    | 'achievement-category'
    | 'story-category';
export type Entry = {
    region?: string;
    maxStack?: number;
    startDate?: string;
    endDate?: string;
    eventType?: string;
    characterDefinition?: CharacterDefinition;
    characterCollection?: CharacterCollection;
    patchOverview?: PatchOverview;
    mainStory?: PatchOverview;
    sideStories?: PatchOverview;
    eventStory?: PatchOverview;
    worldQuests?: PatchOverview;
    lore?: PatchOverview;
    characterInformation?: PatchOverview;
    storyRowCompletion?: Record<string, boolean>;
    storySection?: string;
    icon?: string;
    sectionImageUrl?: string;
    wikiUrl?: string;
    reward?: string;
    rewardIcon?: string;
    description?: string;
    requirementText?: string;
    id: string;
    game: string;
    kind: Kind;
    name: string;
    notes: string;
    quantity: number;
    target: number;
    category: string;
    rarity: number;
    members: string[];
    requirements: { item: string; amount: number }[];
    completed: boolean;
    order: number;
    day: string;
};
/** Player-owned state is stored separately; these fields never enter the shared catalog. */
export type PlayerState = Pick<Entry, 'completed' | 'quantity' | 'target' | 'storyRowCompletion' | 'characterCollection'> & { teams?: Team[] };
export type CatalogEntry = Omit<Entry, keyof PlayerState>;
export type GameSnapshot = { id: string; name: string; revision: number; entries: CatalogEntry[]; characterRules?: CharacterRules };
