import type { Entry } from '@lib/types/workspace.type';
import { balanceDay, balanceEvents, balanceKey, type BalanceOptions } from './event-balance';
import { eventDate } from './event-calendar';
import { readEventPlan, writeEventPlan } from './event-plan-preferences';

/** Calendar and dashboards share the same planning horizon, identity and stable saved assignments. */
export function eventPlanning(entries: Entry[], now: Date, account: string, scope: string, options: BalanceOptions) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 30);
    const relevant = entries.filter(entry => (eventDate(entry.endDate, true, entry.eventSchedule)?.getTime() ?? Infinity) > now.getTime() &&
        (eventDate(entry.startDate, false, entry.eventSchedule)?.getTime() ?? 0) < end.getTime());
    const signature = JSON.stringify({ version: 2, datePolicy: 'local-calendar-end-2359-v1', account, scope, today: balanceDay(now), pins: options.pins ?? {}, capacity: options.maxPerDay ?? 0,
        entries: relevant.map(entry => ({ key: balanceKey(entry), start: entry.startDate, end: entry.endDate, schedule: entry.eventSchedule })).sort((a, b) => a.key.localeCompare(b.key)) });
    const key = `gg-event-plan-v1:${account}:${scope || 'global'}`;
    return { signature, resolve: (force = false) => {
        const saved = !force && readEventPlan(key, signature, balanceDay(start), balanceDay(end));
        if (saved) {return saved;}
        const plan = balanceEvents(relevant, now, { start, end }, options);
        writeEventPlan(key, signature, plan);
        return plan;
    } };
}
