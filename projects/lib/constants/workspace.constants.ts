export const LEGACY_CATALOG_FIELDS = {
    "achievements": "achievements",
    "achievement-category": "achievementCategories",
    "characters": "characters",
    "events": "events",
    "inventory": "inventory",
    "plans": "plans",
    "story": "story",
    "story-category": "storyCategories",
    "teams": "teams",
} as const;


// Colors reference the canonical, appearance-aware palette in _game-themes.scss.
export const GAMES = [
    {
        id: "endfield",
        name: "Arknights: Endfield",
        short: "AE",
        color: "var(--game-endfield-accent)",
        subtitle: "A new frontier",
    },

    {
        id: "ffxiv",
        name: "Final Fantasy XIV",
        short: "FFXIV",
        color: "var(--game-ffxiv-accent)",
        subtitle: "Adventure in Eorzea",
    },

    {
        id: "genshin",
        name: "Genshin Impact",
        short: "GI",
        color: "var(--game-genshin-accent)",
        subtitle: "Teyvat Awaits",
    },

    {
        id: "hsr",
        name: "Honkai: Star Rail",
        short: "HSR",
        color: "var(--game-hsr-accent)",
        subtitle: "Beyond the stars",
    },

    {
        id: "nte",
        name: "Neverness to Everness",
        short: "NTE",
        color: "var(--game-nte-accent)",
        subtitle: "Explore a new world",
    },

    {
        id: "wuwa",
        name: "Wuthering Waves",
        short: "WW",
        color: "var(--game-wuwa-accent)",
        subtitle: "Echoes of Solaris",
    },

    {
        id: "zzz",
        name: "Zenless Zone Zero",
        short: "ZZZ",
        color: "var(--game-zzz-accent)",
        subtitle: "Welcome to New Eridu",
    },
];
