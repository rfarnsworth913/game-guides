import type { Event } from "@lib/types";
import type { GameProfile } from "./types";

const DAY = 86_400_000;
export const dateOnly = (date: Date): string => date.toISOString().slice(0, 10);

/** Adds calendar months with end-of-month clamping, without local timezone conversion. */
export function addCalendarMonths (date: Date, months: number): Date {
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months + 1, 0));
    return new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), Math.min(date.getUTCDate(), end.getUTCDate())));
}

/** Includes the current reset cycle and every cycle beginning before the two-month horizon. */
export function recurringEvents (profile: GameProfile, now: Date, months = 2): Array<Event> {
    if (!Number.isFinite(now.getTime()) || !Number.isInteger(months) || months < 1 || months > 12) {
        throw new Error("Supply a valid date and a horizon of 1–12 months.");
    }
    const serverClock = new Date(now.getTime() + (profile.offsetMinutes - profile.resetHour * 60) * 60_000);
    const today = new Date(Date.UTC(serverClock.getUTCFullYear(), serverClock.getUTCMonth(), serverClock.getUTCDate()));
    const horizon = addCalendarMonths(today, months);
    const events: Array<Event> = [];
    for (const rule of profile.recurring) {
        let start = new Date(today);
        if (rule.cadence === "weekly") { start = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY); }
        if (rule.cadence === "monthly") {
            const day = rule.day ?? 1;
            if (!Number.isInteger(day) || day < 1 || day > 28) { throw new Error(`Invalid monthly reset day for ${rule.title}.`); }
            start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day));
            if (start > today) { start = addCalendarMonths(start, -1); }
        }
        while (start < horizon) {
            const next = rule.cadence === "monthly" ? addCalendarMonths(start, 1)
                : new Date(start.getTime() + DAY * (rule.cadence === "weekly" ? 7 : 1));
            events.push({
                title: rule.title,
                url: rule.url,
                eventType: rule.eventType,
                eventSchedule: { offsetMinutes: profile.offsetMinutes, resetHour: profile.resetHour },
                startDate: dateOnly(start),
                endDate: dateOnly(new Date(next.getTime() - DAY))
            });
            start = next;
        }
    }
    return events;
}
