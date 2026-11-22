import type { EventSchedule } from '@lib/types/event-schedule.type';
import type { PatchOverview } from '@lib/types/story-template.type';
import type { Team } from '@lib/types/team.type';
import type { CharacterCollection, CharacterDefinition, CharacterRules } from '@lib/types/character.type';
import type { GameOverview } from '@lib/types/game-overview.type';
import type { EquipmentDefinition, EquipmentInstance } from '@lib/types/equipment.type';
import type {InventoryMetadata} from '@lib/types/inventory.type';

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
/** @deprecated Combined editor view model. Use CatalogEntry and PlayerState for shared contracts. */
export type Entry = {
    inventoryMetadata?: InventoryMetadata;
    equipmentDefinition?: EquipmentDefinition;
    equipmentInstances?: EquipmentInstance[];
    region?: string;
    maxStack?: number;
    startDate?: string;
    endDate?: string;
    eventType?: string;
    eventSchedule?: EventSchedule;
    characterDefinition?: CharacterDefinition;
    characterCollection?: CharacterCollection;
    patchOverview?: PatchOverview;
    mainStory?: PatchOverview;
    sideStories?: PatchOverview;
    eventStory?: PatchOverview;
    worldQuests?: PatchOverview;
    lore?: PatchOverview;
    characterInformation?: PatchOverview;
    /** Story placement referencing a shared character in this game's catalog. */
    characterId?: string;
    /** Story placement referencing a shared event definition in this game's catalog. */
    eventId?: string;
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
export type PlayerState = {
    completed: boolean;
    quantity: number;
    target: number;
    storyRowCompletion?: Record<string, boolean>;
    characterCollection?: CharacterCollection;
    equipmentInstances?: EquipmentInstance[];
    teams?: Team[];
};

/** @deprecated Flat legacy wire shape, accepted only by compatibility adapters and editor projections. */
export type LegacyCatalogEntry = Omit<Entry, keyof PlayerState>;

/** Flat persisted compatibility fields. Domain contracts preserve the existing wire format. */
type DomainField = 'characterDefinition' | 'characterInformation' | 'inventoryMetadata' | 'equipmentDefinition' | 'maxStack' |
    'patchOverview' | 'mainStory' | 'sideStories' | 'eventStory' | 'worldQuests' | 'lore' | 'characterId' | 'eventId';
type CatalogFields = Omit<Entry, keyof PlayerState | 'kind' | DomainField>;
type DomainFields<Allowed extends DomainField> = Pick<Entry, Allowed> & Partial<Record<Exclude<DomainField, Allowed>, never>>;
export type CharacterCatalogEntry = CatalogFields & DomainFields<'characterDefinition' | 'characterInformation'> & { kind: 'characters' };
export type EventCatalogEntry = CatalogFields & DomainFields<'eventStory'> & { kind: 'events' };
export type StoryCatalogEntry = CatalogFields & DomainFields<'patchOverview' | 'mainStory' | 'sideStories' | 'eventStory' | 'worldQuests' | 'lore' | 'characterInformation' | 'characterId' | 'eventId'> & { kind: 'story' };
export type InventoryCatalogEntry = CatalogFields & DomainFields<'inventoryMetadata' | 'equipmentDefinition' | 'maxStack'> & { kind: 'inventory' };
type OtherCatalogEntry = { [K in Exclude<Kind, 'characters' | 'events' | 'story' | 'inventory'>]: CatalogFields & DomainFields<never> & { kind: K } }[Exclude<Kind, 'characters' | 'events' | 'story' | 'inventory'>];
export type CatalogEntry = CharacterCatalogEntry | EventCatalogEntry | StoryCatalogEntry | InventoryCatalogEntry | OtherCatalogEntry;
export type GameSnapshot = { id: string; name: string; revision: number; entries: CatalogEntry[]; characterRules?: CharacterRules; overview?: GameOverview };
