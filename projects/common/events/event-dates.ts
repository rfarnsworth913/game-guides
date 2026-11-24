import type { EventSchedule } from '@lib/types/event-schedule.type';

export function validEventSchedule(value: unknown): value is EventSchedule {
    if (!value || typeof value !== 'object' || !('offsetMinutes' in value) || !('resetHour' in value)) {return false;}
    return Number.isInteger(value.offsetMinutes) && Number(value.offsetMinutes) >= -840 && Number(value.offsetMinutes) <= 840 &&
        Number.isInteger(value.resetHour) && Number(value.resetHour) >= 0 && Number(value.resetHour) <= 23;
}

/** Date-only tasks use the viewer's calendar day, ending at 23:59. Explicit timestamps stay absolute. */
export function eventBoundary(value: string | undefined, end = false, schedule?: EventSchedule): Date | null {
    if (!value) {return null;}
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        const calendar = new Date(Date.UTC(year, month - 1, day));
        if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {return null;}
        if (schedule && !validEventSchedule(schedule)) {return null;}
        // Reset metadata is retained for source provenance, not applied to calendar-only task dates.
        return new Date(year, month - 1, day, end ? 23 : 0, end ? 59 : 0);
    }
    if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {return null;}
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}
