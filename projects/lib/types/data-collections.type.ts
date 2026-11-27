import type { EventSchedule } from '@lib/types/event-schedule.type';
import type * as mongoDB from "mongodb";

import type { EventType } from "@lib/enums/event-types.enum";

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
    eventSchedule?: EventSchedule;
};
