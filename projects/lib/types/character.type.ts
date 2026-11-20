import type { FarmingConfig, UpgradeRecipe } from './farming-config.type';
import type { InventoryConfig } from './inventory.type';
import type { CharacterExtension, CharacterAttributeDefinition, CharacterProgressionProfile, CharacterNodeState } from './character-extension.type';

export type CharacterSkill = { id?: string; name: string; description: string; maxLevel?: number };
export type AscensionRank = { levelCap: number; skillLevelCap: number };
export type CharacterGuide = { title: string; url: string };
export type CharacterDefinition = CharacterExtension & {
    recipes?: UpgradeRecipe[];
    weaponType: string;
    damageType: string;
    roles: string[];
    skills: CharacterSkill[];
    passiveSkills: CharacterSkill[];
    guides: CharacterGuide[];
};
export type CharacterRules = {
    inventory?: InventoryConfig;
    /** Game-style version label. Numbers remain readable for older saved rules. */
    configurationVersion?: string | number;
    description?: string;
    defaultProgressionProfileId?: string;
    rarityLabels?: Record<string, string>;
    attributes?: CharacterAttributeDefinition[];
    resourceCategories?: string[];
    progressionProfiles?: CharacterProgressionProfile[];
    farming?: FarmingConfig;
    teamSize?: number;
    levelCap: number;
    ascensionRanks?: AscensionRank[];
    rarities: number[];
    weaponTypes: string[];
    damageTypes: string[];
    roles: string[];
    enhancementCategories?: string[];
    equipmentSlots: { id: string; label: string; limit: number; category?: string; system?: 'weapon' | 'equipment'; allowedTypes?: string[] }[];
    progressionTracks: { id: string; label: string; max: number }[];
};
export type CharacterProgression = {
    /** Invested progression only; temporary or equipment bonuses are not stored here. */
    trackValues?: Record<string, number>;
    nodeStates?: Record<string, CharacterNodeState>;
    level: number;
    ascensionRank?: number;
    skillLevels?: Record<string, number>;
    gear: Record<string, string[]>;
    progression: Record<string, number>;
};
export type CharacterCollection = CharacterProgression & {
    /** Planning checkmarks are independent of invested progression. */
    completedGoals?: Record<string, boolean>;
    favorite?: boolean;
    owned: boolean;
    target?: CharacterProgression;
    notes?: string;
    personalGuides?: CharacterGuide[];
};
