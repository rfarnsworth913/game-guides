export type DataFile = {
    /** @deprecated Display-name identity retained for older configurations. Use gameId for matching. */
    id: string;
    gameId?: string;
    sourceList: Array<DataSource>;

    configuration?: Record<string, unknown>;
};

export type DataSource = {
    id: string;
    url: string;
};
