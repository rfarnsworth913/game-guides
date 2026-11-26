import type { Version } from "./version.type";


/**
 * Defines the top level structure for a game
 */
export type GameDocument = {
    gameId: string;                        // Short identifier for the game
    version: Version;                      // Version of the game

    gameConfiguration: GameConfiguration;  // Configuration details for the game

    content: {
        achievements?: Array<unknown>;
        characters?: Array<unknown>;
        events?: Array<unknown>;
        inventory?: Array<unknown>;
        plans?: Array<unknown>;
        story?: Array<unknown>;
        teams?: Array<unknown>;
    };
};


/**
 * Defines the detailed configuration options for a game
 */
export type GameConfiguration = {
    name: string;                         // Name of the game
    short: string;                        // Short name or abbreviation for the game
    subtitle: string;                     // Subtitle of the game
    description: string;                  // Description of the game
    genres: Array<string>;                // Genres of the game

    icon: string;                         // URL or path to the game's icon
    banner: string;                       // URL or path to the game's banner image
    color: string;                        // Primary color associated with the game

    createdAt?: string;                   // Timestamp when the game was created
    updatedAt?: string;                   // Timestamp when the game was last updated

    features: Partial<Record<GameFeature, GameFeatureConfig>>;   // List of features available in the game
    revision: number;                     // Revision number of the game configuration
    visibility: GameVisibility;           // Visibility status of the game
};


export type GameFeatureConfig = {
    feature: GameFeature;                  // The feature this configuration applies to
    visibility: GameVisibility;            // Indicates if the feature is publicly accessible
};


export type GameVisibility = "public" | "editors";

export type GameFeature = "story" | "characters" | "teams" | "inventory" | "plans" | "events" | "farming" | "achievements";


/**
 * Game configuration plus identity, for API responses and UI editing
 */
export type GameRegistration = GameConfiguration & { gameId: string };
