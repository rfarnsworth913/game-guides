export type DataFile = {
    id: string;
    sourceList: Array<DataSource>;
};

export type DataSource = {
    id: string;
    url: string;
    banner?: string;
};
