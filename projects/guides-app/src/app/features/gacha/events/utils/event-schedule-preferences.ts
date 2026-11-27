export type EventSchedulePreferences = { pins: Record<string, string>; maxPerDay: number; compact: boolean };
export function readEventSchedule(key: string): EventSchedulePreferences {
    const defaults: EventSchedulePreferences = { pins: {}, maxPerDay: 0, compact: false };
    try {
        const raw = localStorage.getItem(key);
        const saved: unknown = raw ? JSON.parse(raw) : null;
        if (!saved || typeof saved !== 'object' || !('version' in saved) || saved.version !== 1 ||
            !('pins' in saved) || !saved.pins || typeof saved.pins !== 'object' || Array.isArray(saved.pins) ||
            !('maxPerDay' in saved) || !Number.isInteger(saved.maxPerDay) || Number(saved.maxPerDay) < 0 || Number(saved.maxPerDay) > 1000 ||
            !('compact' in saved) || typeof saved.compact !== 'boolean') {return defaults;}
        const pins = Object.entries(saved.pins);
        if (pins.length > 20000 || pins.some(([id, day]) => id.length > 500 || !id.includes('/') || typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)))) {return defaults;}
        return { pins: Object.fromEntries(pins) as Record<string, string>, maxPerDay: Number(saved.maxPerDay), compact: saved.compact };
    } catch {return defaults;}
}
