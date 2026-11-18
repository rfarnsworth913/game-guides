import { Entry } from "../../../../core/state/workspace.store";

/** Date-only parser dates represent local calendar days; an end date includes that whole day. */
export function eventDate(value: string | undefined, end = false): Date | null {
    if (!value) {return null;}
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {return null;}
        if (end) {date.setDate(date.getDate() + 1);}
        return date;
    }
    if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) {return null;}
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

export type EventDateRange = 'all' | 'today' | 'week' | 'next-7-days' | 'month' | 'next-month' | 'year';

/** Local calendar boundaries, with Monday as the first day of a week. End is exclusive. */
export function eventRange(range: EventDateRange, now: Date): { start: Date; end: Date } | null {
    const year = now.getFullYear(), month = now.getMonth(), day = now.getDate();
    const start = new Date(year, month, day);
    switch (range) {
        case 'all': return null;
        case 'today': return { start, end: new Date(year, month, day + 1) };
        case 'week': {
            start.setDate(day - (now.getDay() + 6) % 7);
            return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) };
        }
        case 'next-7-days': return { start, end: new Date(year, month, day + 7) };
        case 'month': return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) };
        case 'next-month': return { start: new Date(year, month + 1, 1), end: new Date(year, month + 2, 1) };
        case 'year': return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
        default: return null;
    }
}

export function occursBetween(entry: Entry, from: Date, until: Date): boolean {
    const start = eventDate(entry.startDate);
    const end = eventDate(entry.endDate, true);
    if (!start && !end) {return false;}
    if (start && end && end <= start) {return false;}
    if (start && end) {return start < until && end > from;}
    const date = start ?? new Date(end!.getTime() - 1);
    return date >= from && date < until;
}

export function occursOn(entry: Entry, day: Date): boolean {
    return occursBetween(entry, day, new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1));
}

export function monthDays(month: Date): Date[] {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + index));
}

export function eventType(entry: Entry): string { return entry.eventType || entry.category || 'other'; }
export function eventStatus(entry: Pick<Entry, 'startDate' | 'endDate' | 'eventType'>, now: number): 'Active' | 'Upcoming' | 'Ended' | 'Undated' {
    const start = eventDate(entry.startDate)?.getTime();
    const end = eventDate(entry.endDate, true)?.getTime();
    if ((entry.startDate && start === globalThis.undefined) || (entry.endDate && end === globalThis.undefined) ||
        (typeof start === 'number' && typeof end === 'number' && end <= start)) {return 'Undated';}
    if (typeof end === 'number' && now >= end) {return 'Ended';}
    if (typeof start === 'number' && now < start) {return 'Upcoming';}
    return typeof start === 'number' || typeof end === 'number' || entry.eventType === 'permanent' ? 'Active' : 'Undated';
}
export function eventTypeLabel(type: string): string {
    const labels: Record<string, string> = { 'end-game': 'Endgame', tcg: 'TCG', temporary: 'Limited-time', 'weekly-linked': 'Weekly linked' };
    return labels[type] ?? type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function eventTiming(entry: Entry, now: number): { label: string; urgent: boolean } {
    const start = eventDate(entry.startDate)?.getTime();
    const end = eventDate(entry.endDate, true)?.getTime();
    if (start && end && end <= start) {return { label: 'Dates unavailable', urgent: false };}
    if (end && now >= end) {return { label: 'Ended', urgent: false };}
    const upcoming = typeof start === 'number' && now < start;
    const deadline = upcoming ? start : end;
    if (typeof deadline !== 'number') {return { label: start ? 'Ongoing' : 'Dates unavailable', urgent: false };}
    const minutes = Math.max(1, Math.ceil((deadline - now) / 60000));
    const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60);
    const duration = days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
    return { label: `${upcoming ? 'Starts in' : 'Ends in'} ${duration}`, urgent: !upcoming && deadline - now <= 86400000 };
}
