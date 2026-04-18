import * as mongoDB from "mongodb";

import { EventType } from "../enums/event-types.enum.js";


export type RootDocument = {
    _id: mongoDB.ObjectId;
    name: string;
    [key: string]: unknown;
};

export type Event = {
    title: string;
    startDate: string | Date | null;
    endDate: string | Date | null;
    url: string;
    icon?: string;
    eventType: EventType;
    completed?: boolean;
};

export type Version = {
    title: string;
    releaseDate: string | Date | null;
    url: string;
};
