import { readEventPlan, writeEventPlan } from './event-plan-preferences';
import type { BalancedEvents } from './event-balance';

describe('Saved balanced event plans', () => {
    const plan: BalancedEvents = { assignments: { 'genshin/task': '2026-11-21' }, unscheduled: { 'genshin/unknown': 'Deadline needed' }, dailyLimit: 1, start: '2026-11-21', end: '2026-12-21', conflicts: [] };
    beforeEach(() => {
        const values = new Map<string, string>();
        vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    });
    afterEach(() => vi.unstubAllGlobals());
    it('restores only the same signature and scope', () => {
        writeEventPlan('guest:global', 'catalog-and-options', plan);
        expect(readEventPlan('guest:global', 'catalog-and-options', plan.start, plan.end)).toEqual(plan);
        expect(readEventPlan('guest:global', 'changed-catalog', plan.start, plan.end)).toBeNull();
        expect(readEventPlan('alice:global', 'catalog-and-options', plan.start, plan.end)).toBeNull();
    });
    it.each(['2026-11-20', '2026-12-21', '2026-11-31'])('rejects an out-of-window or invalid date %s', day => {
        writeEventPlan('key', 'signature', { ...plan, assignments: { 'genshin/task': day } });
        expect(readEventPlan('key', 'signature', plan.start, plan.end)).toBeNull();
    });
    it('ignores corrupt plans and blocked storage', () => {
        localStorage.setItem('key', '{broken');
        expect(readEventPlan('key', 'signature', plan.start, plan.end)).toBeNull();
        vi.stubGlobal('localStorage', { getItem: () => {throw new Error('Blocked');}, setItem: () => {throw new Error('Full');} });
        expect(() => writeEventPlan('key', 'signature', plan)).not.toThrow();
        expect(readEventPlan('key', 'signature', plan.start, plan.end)).toBeNull();
    });
});
