export type DataFile = {
    id: string;
    sourceList: Array<DataSource>;

    configuration?: Record<string, unknown>;
};

export type DataSource = {
    id: string;
    url: string;
};
