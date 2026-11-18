import type { Entry } from '@lib/types/workspace.type';
import { eventDate } from './event-calendar';

export const balanceKey = (entry: Pick<Entry, 'game' | 'id'>) => `${entry.game}/${entry.id}`;
export const balanceDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
type Job = { key: string; first: number; last: number; preferred: number };
export type BalancedEvents = { assignments: Record<string, string>; unscheduled: Record<string, string>; dailyLimit: number; start: string; end: string; conflicts?: string[] };
export type BalanceOptions = { maxPerDay?: number; pins?: Record<string, string> };

/** One task per event. Binary-search EDF feasibility minimizes the peak daily count. */
export function balanceEvents(entries: readonly Entry[], now: Date, range?: { start: Date; end: Date } | null, options: BalanceOptions = {}): BalancedEvents {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = range && range.start > today ? range.start : today;
    const until = range?.end ?? new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
    const days: Date[] = [];
    for (let date = new Date(start); date < until; date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)) {days.push(date);}
    const result: BalancedEvents = { assignments: {}, unscheduled: {}, dailyLimit: options.maxPerDay ?? 0, start: balanceDay(start), end: balanceDay(until), conflicts: [] };
    const jobs: Job[] = [];
    const pinnedLoads = days.map(() => 0);
    for (const entry of entries) {
        const key = balanceKey(entry), release = eventDate(entry.startDate), deadline = eventDate(entry.endDate, true);
        const pin = options.pins?.[key];
        if (pin) {
            const index = days.findIndex(day => balanceDay(day) === pin);
            const date = index >= 0 ? days[index] : null;
            const next = date ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1) : null;
            if (!date || !next || (release && release >= next) || (deadline && (date >= deadline || (!entry.completed && deadline <= now)))) {
                result.unscheduled[key] = 'Pinned date conflicts with availability, deadline, or the planning range.'; continue;
            }
            result.assignments[key] = pin;
            if (!entry.completed) {pinnedLoads[index]++;}
            continue;
        }
        if (entry.completed) {continue;}
        if (!deadline || (entry.startDate && !release) || (release && deadline <= release)) {result.unscheduled[key] = 'A valid deadline is needed to suggest a day.'; continue;}
        if (deadline <= now) {result.unscheduled[key] = 'This event has expired.'; continue;}
        const available = days.flatMap((date, index) => {
            const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
            return date < deadline && (!release || release < end) ? [index] : [];
        });
        if (!available.length) {result.unscheduled[key] = 'No available day in the planning range.'; continue;}
        const target = new Date(deadline.getTime() - 1);
        target.setDate(target.getDate() - 7);
        const preferred = available.filter(index => days[index] <= target).at(-1) ?? available[0];
        jobs.push({ key, first: available[0], last: available[available.length - 1], preferred });
    }
    const pinnedPeak = Math.max(0, ...pinnedLoads);
    if (options.maxPerDay && pinnedPeak > options.maxPerDay) {result.conflicts!.push('Pinned tasks exceed the daily limit. Move a pinned task or increase the limit.');}
    if (!jobs.length) {result.dailyLimit ||= pinnedPeak; return result;}
    jobs.sort((a, b) => a.first - b.first || a.last - b.last || a.key.localeCompare(b.key));
    const schedule = (capacity: number, early = false, partial = false): Map<string, number> | null => {
        const assigned = new Map<string, number>();
        const ready: Job[] = [];
        let cursor = 0;
        for (let day = 0; day < days.length; day++) {
            while (cursor < jobs.length && jobs[cursor].first <= day) {ready.push(jobs[cursor++]);}
            const due = (job: Job) => early ? job.preferred : job.last;
            ready.sort((a, b) => due(a) - due(b) || a.key.localeCompare(b.key));
            while (ready.length && due(ready[0]) < day) {if (!partial) {return null;} ready.shift();}
            for (let slot = pinnedLoads[day]; slot < capacity && ready.length; slot++) {assigned.set(ready.shift()!.key, day);}
        }
        return partial || assigned.size === jobs.length ? assigned : null;
    };
    let low = Math.max(1, pinnedPeak), high = jobs.length + pinnedPeak;
    while (low < high) {
        const capacity = Math.floor((low + high) / 2);
        if (schedule(capacity)) {high = capacity;} else {low = capacity + 1;}
    }
    const capacity = options.maxPerDay || low;
    const assigned = schedule(capacity, true) ?? schedule(capacity) ?? schedule(capacity, false, true)!;
    for (const job of jobs) {if (!assigned.has(job.key)) {result.unscheduled[job.key] = 'Daily task limit leaves no available day before the deadline.';}}
    const loads = [...pinnedLoads];
    for (const day of assigned.values()) {loads[day]++;}
    // Move flexible tasks out of crowded days without increasing the optimal peak.
    let changed = true;
    const flexible = [...jobs].sort((a, b) => (b.last - b.first) - (a.last - a.first) || a.key.localeCompare(b.key));
    while (changed) {
        changed = false;
        for (const job of flexible) {
            if (!assigned.has(job.key)) {continue;}
            const current = assigned.get(job.key)!;
            let target = current;
            for (let day = job.first; day <= Math.max(job.preferred, current); day++) {if (loads[day] < loads[target]) {target = day;}}
            if (loads[target] + 1 < loads[current]) {
                loads[current]--; loads[target]++; assigned.set(job.key, target); changed = true;
            }
        }
    }
    result.dailyLimit = capacity;
    for (const [key, day] of assigned) {result.assignments[key] = balanceDay(days[day]);}
    return result;
}
