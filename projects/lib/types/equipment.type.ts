import type { CharacterProgression } from '@lib/types/character.type';
import type { ProgressionTrackDefinition } from '@lib/types/character-extension.type';

export type EquipmentStat = { name: string; value: string };
/** Shared inventory catalog metadata; player upgrades never change this definition. */
export type EquipmentDefinition = {
    typeId: string;
    weaponType?: string;
    progressionTracks?: ProgressionTrackDefinition[];
    stats?: EquipmentStat[];
    setId?: string;
    setBonuses?: { pieces: number; description: string }[];
};
/** An owned copy stays on its inventory record when equipped, replaced or unequipped. */
export type EquipmentInstance = {
    id: string;
    current: CharacterProgression;
    target?: CharacterProgression;
    mainStat?: EquipmentStat;
    substats?: EquipmentStat[];
};
