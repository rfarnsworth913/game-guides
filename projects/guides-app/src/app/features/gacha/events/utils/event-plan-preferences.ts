import type { BalancedEvents } from './event-balance';
import { eventDate } from './event-calendar';

/** Restore only a structurally valid plan for the same catalog, server day and scheduling options. */
export function readEventPlan(key: string, signature: string, start: string, end: string): BalancedEvents | null {
    try {
        const raw = localStorage.getItem(key);
        const saved: unknown = raw ? JSON.parse(raw) : null;
        if (!saved || typeof saved !== 'object' || !('version' in saved) || saved.version !== 1 ||
            !('signature' in saved) || saved.signature !== signature || !('plan' in saved) || !saved.plan || typeof saved.plan !== 'object') {return null;}
        const plan = saved.plan as Record<string, unknown>;
        if (plan['start'] !== start || plan['end'] !== end || !Number.isInteger(plan['dailyLimit']) ||
            Number(plan['dailyLimit']) < 0 || Number(plan['dailyLimit']) > 20000) {return null;}
        const record = (value: unknown): value is Record<string, string> => !!value && typeof value === 'object' && !Array.isArray(value) &&
            Object.keys(value).length <= 20000 && Object.entries(value).every(([id, text]) => id.includes('/') && id.length <= 500 && typeof text === 'string' && text.length <= 500);
        if (!record(plan['assignments']) || !record(plan['unscheduled']) || Object.values(plan['assignments']).some(day =>
            !/^\d{4}-\d{2}-\d{2}$/.test(day) || !eventDate(day) || day < start || day >= end)) {return null;}
        const conflicts = plan['conflicts'] ?? [];
        if (!Array.isArray(conflicts) || conflicts.length > 100 || !conflicts.every((text: unknown) => typeof text === 'string' && text.length <= 500)) {return null;}
        return { assignments: plan['assignments'], unscheduled: plan['unscheduled'], dailyLimit: Number(plan['dailyLimit']), start, end, conflicts: conflicts as string[] };
    } catch {return null;}
}

export function writeEventPlan(key: string, signature: string, plan: BalancedEvents): void {
    try {localStorage.setItem(key, JSON.stringify({ version: 1, signature, plan }));}
    catch { /* Scheduling remains available when storage is blocked or full. */ }
}
