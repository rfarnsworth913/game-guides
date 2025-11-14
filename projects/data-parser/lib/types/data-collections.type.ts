import * as mongoDB from "mongodb";

export type RootDocument = {
    _id: mongoDB.ObjectId;
    name: string;
    [key: string]: unknown;
};

export type Event = {
    title: string;
    startDate: string;
    endDate: string;
    url: string;
    banner: string;
    eventType: string;
    completed?: boolean;
};
