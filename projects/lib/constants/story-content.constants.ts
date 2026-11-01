import type { StoryContentType } from "@lib/types/story-content.type";


/** Stable template IDs are stored in game documents; display names may vary by game. */
export const STORY_CONTENT_TYPES = [
    { id: "character-information", title: "Character Information" },
    { id: "endgame-activity", title: "Endgame Activities" },
    { id: "events", title: "Events" },
    { id: "lore", title: "Lore" },
    { id: "main-story", title: "Main Story" },
    { id: "patch-overview", title: "Patch Overview" },
    { id: "side-stories", title: "Character Stories" },
    { id: "world-quests", title: "World Quests" },
] as const;


/** Add game terminology here without changing templates, topic colors, or saved categories. */
export const GAME_STORY_NAMES: Readonly<Record<string, Partial<Record<StoryContentType, string>>>> = {
    endfield: {
        "character-information": "Operator Info",
        "main-story": "Main Mission",
        "side-stories": "Operator Mission",
        "world-quests": "Exploration Missions"
    },

    genshin: {
        "character-information": "Character Info",
        "main-story": "Archon Quest",
        "side-stories": "Story Quest",
    },

    hsr: {
        "main-story": "Trailblaze Mission",
        "world-quests": "Adventure Missions"
    },

    zzz: {
        "main-story": "Phaethon's Story",
        "side-stories": "Agent Story"
    },
};
