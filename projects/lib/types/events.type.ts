export type Event = {
    title: string;
    url: string;

    banner?: string;

    startDate: string | Date | null;
    endDate: string | Date | null;

    completed: boolean;
    eventType: string;
    eventSubType: string;
};
