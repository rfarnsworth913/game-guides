import type { EventDateRange } from './event-calendar';

export type EventViewPreferences = {
    view: 'list' | 'calendar'; selectedGame: string; groups: string[]; type: string;
    status: 'all' | 'not-expired' | 'active'; period: EventDateRange; search: string;
    showCompleted: boolean; balanceEnabled: boolean; filtersOpen: boolean;
    month: string; backlogSort: 'deadline' | 'game' | 'completion';
    settingsOpen: boolean; summaryFilter: 'all' | 'scheduled' | 'completed'; collapsedGroups: string[];
};

export function readEventView(key: string, defaults: EventViewPreferences): EventViewPreferences {
    try {
        const raw = localStorage.getItem(key);
        const saved: unknown = raw ? JSON.parse(raw) : null;
        if (!saved || typeof saved !== 'object' || !('version' in saved) || saved.version !== 1) {return defaults;}
        const value = saved as Record<string, unknown>;
        const result = { ...defaults };
        if (value['view'] === 'list' || value['view'] === 'calendar') {result.view = value['view'];}
        if (value['status'] === 'all' || value['status'] === 'not-expired' || value['status'] === 'active') {result.status = value['status'];}
        if (value['backlogSort'] === 'deadline' || value['backlogSort'] === 'game' || value['backlogSort'] === 'completion') {result.backlogSort = value['backlogSort'];}
        if (value['summaryFilter'] === 'all' || value['summaryFilter'] === 'scheduled' || value['summaryFilter'] === 'completed') {result.summaryFilter = value['summaryFilter'];}
        if (Array.isArray(value['collapsedGroups']) && value['collapsedGroups'].every((id: unknown) => id === 'active' || id === 'completed' || id === 'ended')) {result.collapsedGroups = [...new Set(value['collapsedGroups'] as string[])];}
        if (typeof value['period'] === 'string' && ['all', 'today', 'week', 'next-7-days', 'month', 'next-month', 'year'].includes(value['period'])) {result.period = value['period'] as EventDateRange;}
        for (const field of ['selectedGame', 'type', 'search'] as const) {
            if (typeof value[field] === 'string' && value[field].length <= 500) {result[field] = value[field];}
        }
        for (const field of ['showCompleted', 'balanceEnabled', 'filtersOpen', 'settingsOpen'] as const) {
            if (typeof value[field] === 'boolean') {result[field] = value[field];}
        }
        if (Array.isArray(value['groups']) && value['groups'].length <= 100 && value['groups'].every((group: unknown) => typeof group === 'string' && !!group.trim() && group.length <= 160)) {result.groups = [...new Set(value['groups'] as string[])];}
        if (typeof value['month'] === 'string' && /^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(value['month'])) {result.month = value['month'];}
        return result;
    } catch {return defaults;}
}
