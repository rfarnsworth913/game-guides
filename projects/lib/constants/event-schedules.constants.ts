import type { EventSchedule } from '@lib/types/event-schedule.type';

/** Shared parser/UI reset clocks. Offsets describe configured servers, not the viewer's timezone. */
export const EVENT_SCHEDULES: Readonly<Record<string, EventSchedule>> = {
    endfield: { offsetMinutes: -300, resetHour: 4 },
    fgo: { offsetMinutes: 0, resetHour: 0 },
    genshin: { offsetMinutes: -300, resetHour: 4 },
    gf2: { offsetMinutes: -240, resetHour: 5 },
    hsr: { offsetMinutes: -300, resetHour: 4 },
    nte: { offsetMinutes: -300, resetHour: 5 },
    wuwa: { offsetMinutes: -300, resetHour: 4 },
    zzz: { offsetMinutes: -300, resetHour: 4 },
};
