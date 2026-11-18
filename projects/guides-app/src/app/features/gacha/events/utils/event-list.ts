import type { Entry } from '@lib/types/workspace.type';
import { eventDate, eventStatus } from './event-calendar';

export type EventGroupId = 'active' | 'completed' | 'ended';
export function eventGroup(entry: Entry, now: number): EventGroupId {
    return entry.completed ? 'completed' : eventStatus(entry, now) === 'Ended' ? 'ended' : 'active';
}
export function compareAvailableEvents(a: Entry, b: Entry, now: number): number {
    const rank = { Active: 0, Upcoming: 1, Undated: 2, Ended: 3 };
    const status = eventStatus(a, now), other = eventStatus(b, now);
    const date = (entry: Entry) => status === 'Upcoming' ? eventDate(entry.startDate)?.getTime() ?? Infinity : eventDate(entry.endDate, true)?.getTime() ?? Infinity;
    const dates = status === 'Ended' ? date(b) - date(a) : date(a) - date(b);
    return rank[status] - rank[other] || dates || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}
export function compareEventHistory(a: Entry, b: Entry): number {
    const date = (entry: Entry) => eventDate(entry.endDate, true)?.getTime() ?? eventDate(entry.startDate)?.getTime() ?? 0;
    return date(b) - date(a) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}
