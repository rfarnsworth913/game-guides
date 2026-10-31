import type { GameTheme } from '../../models/types';

export const GAME_THEMES: ReadonlyArray<{ id: GameTheme; label: string }> = [
    { id: "default", label: "All games" },
    { id: "ffxiv", label: "Final Fantasy XIV" },
    { id: "genshin", label: "Genshin Impact" },
    { id: "hsr", label: "Honkai: Star Rail" },
    { id: "nte", label: "Neverness to Everness" },
    { id: "zzz", label: "Zenless Zone Zero" },
    { id: "wuwa", label: "Wuthering Waves" },
    { id: "endfield", label: "Arknights: Endfield" },
];
