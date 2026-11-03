import type { FarmingConfig, UpgradeRecipe } from './farming-config.type';

export type CharacterSkill = { id?: string; name: string; description: string; maxLevel?: number };
export type AscensionRank = { levelCap: number; skillLevelCap: number };
export type CharacterGuide = { title: string; url: string };
export type CharacterDefinition = {
    recipes?: UpgradeRecipe[];
    weaponType: string;
    damageType: string;
    roles: string[];
    skills: CharacterSkill[];
    passiveSkills: CharacterSkill[];
    guides: CharacterGuide[];
};
export type CharacterRules = {
    farming?: FarmingConfig;
    teamSize?: number;
    levelCap: number;
    ascensionRanks?: AscensionRank[];
    rarities: number[];
    weaponTypes: string[];
    damageTypes: string[];
    roles: string[];
    enhancementCategories?: string[];
    equipmentSlots: { id: string; label: string; limit: number; category?: string }[];
    progressionTracks: { id: string; label: string; max: number }[];
};
export type CharacterProgression = {
    level: number;
    ascensionRank?: number;
    skillLevels?: Record<string, number>;
    gear: Record<string, string[]>;
    progression: Record<string, number>;
};
export type CharacterCollection = CharacterProgression & {
    owned: boolean;
    target?: CharacterProgression;
    notes?: string;
    personalGuides?: CharacterGuide[];
};
