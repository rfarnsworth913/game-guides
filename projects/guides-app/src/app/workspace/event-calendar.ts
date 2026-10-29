import { Entry } from './workspace.store';

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

export function occursOn(entry: Entry, day: Date): boolean {
    const start = eventDate(entry.startDate);
    const end = eventDate(entry.endDate, true);
    if (!start && !end) {return false;}
    if (start && end && end <= start) {return false;}
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    if (start && end) {return start < next && end > day;}
    const date = start ?? new Date(end!.getTime() - 1);
    return date >= day && date < next;
}

export function monthDays(month: Date): Date[] {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + index));
}

export function eventType(entry: Entry): string { return entry.eventType || entry.category || 'other'; }
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
