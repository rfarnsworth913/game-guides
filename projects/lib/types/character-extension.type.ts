/** Additive character contracts. Identity/game IDs remain on the existing catalog entry. */
export type CharacterAttributeDefinition = {
    id: string; label: string; type: 'string' | 'number' | 'boolean' | 'enum' | 'multi-select';
    options?: string[]; displayOrder: number; filterable: boolean; visibleInHeader: boolean;
    searchable?: boolean; visibleInDetails?: boolean; required?: boolean;
};
export type CharacterResource = {
    id: string; category: string; title: string; sourceType: 'external' | 'internal';
    url?: string; contentId?: string; description?: string; creator?: string; language?: string;
    tags?: string[]; isOfficial?: boolean; sortOrder?: number;
};
export type CharacterAbility = {
    id: string; name: string; category: string; description?: string; icon?: string; sourceUrl?: string;
    progressionTrackId?: string; unlockRequirements?: string[];
};
export type ProgressionDependency = { trackId: string; requiredValue: number };
export type UpgradeCost = { fromValue: number; toValue: number; materials: { itemId: string; quantity: number }[] };
export type ProgressionTrackDefinition = {
    id: string; label: string; type: 'level' | 'ascension' | 'skill' | 'unlock' | 'enhancement' | 'equipment' | 'custom';
    minValue?: number; maxValue?: number; levels?: number[]; displayOrder: number; abilityId?: string;
    dependencies?: ProgressionDependency[]; upgradeCosts?: UpgradeCost[];
    /** Bind existing progress instead of copying it into the extension maps. */
    storage?: { field: 'level' | 'ascensionRank' | 'skillLevels' | 'progression'; key?: string };
};
export type CharacterProgressionProfile = { id: string; gameId: string; tracks: ProgressionTrackDefinition[] };
export type CharacterNodeState = { unlocked: boolean };
export type CharacterExtension = {
    headshot?: string;
    /** Optional Character Details header background; splash art is the fallback. */
    banner?: string;
    alternateNames?: string[];
    schemaVersion?: 2;
    attributes?: Record<string, string | number | boolean | string[]>;
    abilities?: CharacterAbility[];
    resources?: CharacterResource[];
    progressionProfileId?: string;
    /** Full replacement rules for existing profile track IDs, never new tracks. */
    progressionOverrides?: ProgressionTrackDefinition[];
};
export type CharacterCatalogRecord = {
    id: string; gameId: string;
    identity: { name: string; description: string; releaseVersion?: string; alternateNames?: string[] };
    classification: { rarity: number; attributes: Record<string, string | number | boolean | string[]> };
    media: { icon?: string; headshot?: string; fullArtwork?: string; banner?: string };
    abilities: CharacterAbility[]; resources: CharacterResource[];
    /** Null identifies a preserved legacy character using the existing game-wide rules. */
    progressionProfileId: string | null;
    progressionOverrides?: ProgressionTrackDefinition[];
    metadata: { schemaVersion: 2; sourceSchemaVersion: number; sourceUrls?: string[] };
};
