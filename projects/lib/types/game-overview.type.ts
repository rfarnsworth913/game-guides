export type GameFeature = 'story' | 'characters' | 'teams' | 'inventory' | 'plans' | 'events' | 'farming' | 'achievements';

export type GameOverview = {
    id: string;
    name: string;
    short: string;
    subtitle: string;
    description: string;
    gameType: string;
    icon: string;
    banner: string;
    features: GameFeature[];
    archived: boolean;
    revision: number;
    color: string;
};
