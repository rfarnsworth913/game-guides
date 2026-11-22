import type { EventSchedule } from '@lib/types/event-schedule.type';

export function validEventSchedule(value: unknown): value is EventSchedule {
    if (!value || typeof value !== 'object' || !('offsetMinutes' in value) || !('resetHour' in value)) {return false;}
    return Number.isInteger(value.offsetMinutes) && Number(value.offsetMinutes) >= -840 && Number(value.offsetMinutes) <= 840 &&
        Number.isInteger(value.resetHour) && Number(value.resetHour) >= 0 && Number(value.resetHour) <= 23;
}

/** Timestamp periods are absolute. Server dates use their reset clock; legacy dates use local days. */
export function eventBoundary(value: string | undefined, end = false, schedule?: EventSchedule): Date | null {
    if (!value) {return null;}
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        const calendar = new Date(Date.UTC(year, month - 1, day));
        if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {return null;}
        if (schedule) {
            if (!validEventSchedule(schedule)) {return null;}
            return new Date(calendar.getTime() + (end ? 86_400_000 : 0) + (schedule.resetHour * 60 - schedule.offsetMinutes) * 60_000);
        }
        // Legacy compatibility: undifferentiated date-only records remain local inclusive days.
        return new Date(year, month - 1, day + (end ? 1 : 0));
    }
    if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {return null;}
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}
