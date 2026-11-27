import type { Entry } from '@lib/types/workspace.type';
import { balanceDay, balanceEvents, balanceKey } from './event-balance';
import { EVENT_SCHEDULES } from '@lib/constants/event-schedules.constants';
import { occursOn } from './event-calendar';

const now = new Date(2026, 10, 17, 12);
const range = { start: new Date(2026, 10, 17), end: new Date(2026, 10, 20) };
const event = (id: string, startDate = '2026-11-17', endDate = '2026-11-19'): Entry => ({
    id, game: 'genshin', kind: 'events', name: id, notes: '', category: '', eventType: 'temporary', startDate, endDate,
    rarity: 1, order: 0, day: '', members: [], requirements: [], completed: false, quantity: 0, target: 0,
});

describe('Balanced event scheduling', () => {
    it('keeps each game’s daily task on its labeled day instead of balancing it past midnight', () => {
        const current = new Date(2026, 10, 23, 0, 30);
        const entries = Object.entries(EVENT_SCHEDULES).flatMap(([game, eventSchedule]) => ['2026-11-23', '2026-11-24'].map(date => ({
            ...event(`${game}-${date}`, date, date), game, eventType: 'daily', eventSchedule,
        })));
        const before = structuredClone(entries);
        const plan = balanceEvents(entries, current);
        for (const entry of entries) {
            expect(plan.assignments[balanceKey(entry)]).toBe(entry.startDate);
            expect(occursOn(entry, new Date(2026, 10, 23))).toBe(entry.startDate === '2026-11-23');
        }
        expect(entries).toEqual(before);
    });
    it('minimizes daily load and preserves the input catalog and dates', () => {
        const entries = Array.from({ length: 6 }, (_, index) => event(String(index)));
        const before = structuredClone(entries);
        const plan = balanceEvents(entries, now, range);
        expect(plan.dailyLimit).toBe(2);
        expect(Object.values(plan.assignments).sort()).toEqual(['2026-11-17', '2026-11-17', '2026-11-18', '2026-11-18', '2026-11-19', '2026-11-19']);
        expect(plan.unscheduled).toEqual({});
        expect(entries).toEqual(before);
        expect(balanceEvents([...entries].reverse(), now, range)).toEqual(plan);
    });
    it('puts urgent events before their deadline and respects future availability', () => {
        const urgent = Array.from({ length: 3 }, (_, index) => event(`urgent-${index}`, '2026-11-16', '2026-11-17'));
        const future = event('future', '2026-11-19', '2026-11-19');
        const plan = balanceEvents([...urgent, future], now, range);
        expect(plan.dailyLimit).toBe(3);
        for (const entry of urgent) {expect(plan.assignments[balanceKey(entry)]).toBe('2026-11-17');}
        expect(plan.assignments[balanceKey(future)]).toBe('2026-11-19');
    });
    it('keeps expired, invalid and out-of-range events unscheduled and ignores completed events', () => {
        const entries = [event('expired', '', '2026-11-16'), event('undated', '', ''), event('future', '2026-12-01', '2026-12-05'),
            event('invalid', '2026-11-20', '2026-11-17'), { ...event('done'), completed: true },
            event('exact-expiry', '', now.toISOString())];
        const plan = balanceEvents(entries, now, range);
        expect(plan.assignments).toEqual({}); expect(plan.dailyLimit).toBe(0);
        expect(Object.keys(plan.unscheduled)).toHaveLength(5);
        expect(plan.unscheduled['genshin/expired']).toContain('expired');
        expect(plan.unscheduled['genshin/undated']).toContain('deadline');
        expect(plan.unscheduled['genshin/future']).toContain('planning range');
        expect(plan.unscheduled['genshin/done']).toBeUndefined();
    });
    it('defaults to 30 local days and distinguishes identical event IDs across games', () => {
        const entries = [event('same'), { ...event('same'), game: 'hsr' }];
        const plan = balanceEvents(entries, now);
        expect(Object.keys(plan.assignments)).toHaveLength(2);
        expect(plan.end).toBe('2026-12-17');
        expect(plan.dailyLimit).toBe(1);
        expect(balanceDay(new Date(2026, 0, 1))).toBe('2026-01-01');
    });
    it('matches an exhaustive scheduling oracle for small constrained windows', () => {
        let seed = 17;
        const random = (limit: number) => {seed = (seed * 1664525 + 1013904223) % 4294967296; return seed % limit;};
        for (let sample = 0; sample < 30; sample++) {
            const windows = Array.from({ length: 6 }, () => {const first = random(3); return { first, last: first + random(3 - first) };});
            let optimum = windows.length;
            const loads = [0, 0, 0];
            const enumerate = (index: number) => {
                if (index === windows.length) {optimum = Math.min(optimum, Math.max(...loads)); return;}
                for (let day = windows[index].first; day <= windows[index].last; day++) {
                    loads[day]++; if (loads[day] <= optimum) {enumerate(index + 1);} loads[day]--;
                }
            };
            enumerate(0);
            const entries = windows.map((window, index) => event(String(index), `2026-11-${17 + window.first}`, `2026-11-${17 + window.last}`));
            const plan = balanceEvents(entries, now, range);
            expect(plan.dailyLimit).toBe(optimum);
            for (const [index, window] of windows.entries()) {
                const day = Number(plan.assignments[`genshin/${index}`].slice(-2)) - 17;
                expect(day).toBeGreaterThanOrEqual(window.first); expect(day).toBeLessThanOrEqual(window.last);
            }
        }
    });
    it('respects a configured capacity and explains events that cannot fit', () => {
        const entries = Array.from({ length: 3 }, (_, index) => event(String(index), '2026-11-17', '2026-11-17'));
        const plan = balanceEvents(entries, now, range, { maxPerDay: 1 });
        expect(plan.dailyLimit).toBe(1); expect(Object.keys(plan.assignments)).toHaveLength(1);
        expect(Object.values(plan.unscheduled)).toHaveLength(2);
        expect(Object.values(plan.unscheduled)[0]).toContain('Daily task limit');
    });
    it('preserves manual pins including undated tasks and reports pinned capacity conflicts', () => {
        const a = event('a'), b = event('b'), c = event('c', '', '');
        const pins = { 'genshin/a': '2026-11-19', 'genshin/b': '2026-11-19', 'genshin/c': '2026-11-18' };
        const plan = balanceEvents([a, b, c], now, range, { pins, maxPerDay: 1 });
        expect(plan.assignments).toEqual(pins);
        expect(plan.conflicts?.[0]).toContain('Pinned tasks exceed');
        expect(balanceEvents([a, { ...b, completed: true }, c], now, range, { pins, maxPerDay: 1 }).conflicts).toEqual([]);
        expect(balanceEvents([a], now, range, { pins: { 'genshin/a': '2026-11-20' } }).unscheduled['genshin/a']).toContain('Pinned date conflicts');
    });
    it('aims seven days before expiry when feasible while retaining the real deadline as fallback', () => {
        const long = event('long', '2026-11-17', '2026-11-29');
        const short = event('short', '2026-11-17', '2026-11-17');
        const plan = balanceEvents([long, short], now);
        expect(plan.assignments['genshin/short']).toBe('2026-11-17');
        expect(plan.assignments['genshin/long'] <= '2026-11-22').toBe(true);
    });
});
