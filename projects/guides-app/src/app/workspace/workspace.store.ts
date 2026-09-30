import { Injectable, signal } from '@angular/core';

export type Kind =
    | 'inventory'
    | 'characters'
    | 'teams'
    | 'plans'
    | 'story'
    | 'events'
    | 'achievements'
    | 'achievement-category';
export type Entry = {
    icon?: string;
    wikiUrl?: string;
    reward?: string;
    rewardIcon?: string;
    description?: string;
    requirementText?: string;
    id: string;
    game: string;
    kind: Kind;
    name: string;
    notes: string;
    quantity: number;
    target: number;
    category: string;
    rarity: number;
    members: string[];
    requirements: { item: string; amount: number }[];
    completed: boolean;
    order: number;
    day: string;
};
export const GAMES = [
    {
        id: 'genshin',
        name: 'Genshin Impact',
        short: 'GI',
        color: '#dcb975',
        subtitle: 'Teyvat awaits',
    },
    {
        id: 'hsr',
        name: 'Honkai: Star Rail',
        short: 'HSR',
        color: '#ae9bff',
        subtitle: 'Beyond the stars',
    },
    {
        id: 'wuwa',
        name: 'Wuthering Waves',
        short: 'WW',
        color: '#75cbbb',
        subtitle: 'Echoes of Solaris',
    },
    {
        id: 'zzz',
        name: 'Zenless Zone Zero',
        short: 'ZZZ',
        color: '#dfed70',
        subtitle: 'Welcome to New Eridu',
    },
    {
        id: 'endfield',
        name: 'Arknights: Endfield',
        short: 'AE',
        color: '#eea575',
        subtitle: 'A new frontier',
    },
];
const KEY = 'gg-workspace-v1';
export function validEntries(value: unknown): value is Entry[] {
    return (
        Array.isArray(value) &&
        value.length <= 20000 &&
        value.every(
            (e: Entry) =>
                e &&
                typeof e.id === 'string' &&
                GAMES.some((g) => g.id === e.game) &&
                [
                    'inventory',
                    'characters',
                    'teams',
                    'plans',
                    'story',
                    'events',
                    'achievements',
                    'achievement-category',
                ].includes(e.kind) &&
                typeof e.name === 'string' &&
                typeof e.notes === 'string' &&
                typeof e.category === 'string' &&
                typeof e.day === 'string' &&
                typeof e.completed === 'boolean' &&
                [e.icon, e.wikiUrl, e.reward, e.requirementText, e.rewardIcon, e.description].every(
                    (v) => typeof v === 'undefined' || typeof v === 'string',
                ) &&
                [e.quantity, e.target, e.rarity, e.order].every(
                    (n) => Number.isFinite(n) && n >= 0,
                ) &&
                Array.isArray(e.members) &&
                e.members.every((m) => typeof m === 'string') &&
                Array.isArray(e.requirements) &&
                e.requirements.every(
                    (r) =>
                        r &&
                        typeof r.item === 'string' &&
                        Number.isFinite(r.amount) &&
                        r.amount > 0,
                ),
        ) &&
        new Set(value.map((e: Entry) => e.id)).size === value.length
    );
}
/** Preserve earlier standalone achievements by placing them into categories. */
export function migrateAchievements(entries: Entry[]): Entry[] {
    const result = entries.map((e) => ({ ...e }));
    for (const achievement of result.filter((e) => e.kind === 'achievements')) {
        if (
            result.some(
                (e) =>
                    e.kind === 'achievement-category' &&
                    e.id === achievement.category &&
                    e.game === achievement.game,
            )
        ) {
            continue;
        }
        const title =
            achievement.category && achievement.category !== 'Materials'
                ? achievement.category
                : 'General';
        const id = `achievement-category:${achievement.game}:${encodeURIComponent(title)}`;
        if (!result.some((e) => e.id === id)) {
            result.push({
                ...achievement,
                id,
                kind: 'achievement-category',
                name: title,
                icon: '\u2606',
                wikiUrl: '',
                reward: '',
                notes: '',
                category: '',
                completed: false,
                members: [],
                requirements: [],
            });
        }
        achievement.category = id;
        achievement.requirementText ??= achievement.notes;
    }
    return result;
}
export function parseBackup(raw: string): Entry[] {
    const data: unknown = JSON.parse(raw);
    if (
        !data ||
        typeof data !== 'object' ||
        !('version' in data) ||
        data.version !== 1 ||
        !('entries' in data) ||
        !validEntries(data.entries)
    ) {
        throw new Error('Invalid workspace backup');
    }
    return migrateAchievements(data.entries);
}
@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
    private unreadable = false;
    readonly error = signal('');
    readonly entries = signal<Entry[]>(this.restore());
    private restore(): Entry[] {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) {
                return [];
            }
            return parseBackup(raw);
        } catch {
            this.unreadable = true;
            this.error.set(
                'Saved data could not be read. It has not been overwritten. Import a valid backup or reload after enabling browser storage.',
            );
            return [];
        }
    }
    replace(entries: Entry[]): boolean {
        try {
            localStorage.setItem(KEY, JSON.stringify({ version: 1, entries }));
            this.entries.set(entries);
            this.unreadable = false;
            this.error.set('');
            return true;
        } catch {
            this.error.set(
                'Could not save. Browser storage may be full or unavailable. Your previous saved data is unchanged.',
            );
            return false;
        }
    }
    save(entry: Entry): boolean {
        if (this.unreadable) {
            return false;
        }
        return this.replace([...this.entries().filter((e) => e.id !== entry.id), entry]);
    }
    remove(id: string): boolean {
        if (this.unreadable) {
            return false;
        }
        return this.replace(
            this.entries()
                .filter((e) => e.id !== id && !(e.kind === 'achievements' && e.category === id))
                .map((e) => ({
                    ...e,
                    members: e.members.filter((m) => m !== id),
                    requirements: e.requirements.filter((r) => r.item !== id),
                })),
        );
    }
    materials(plans: Entry[]) {
        const totals = new Map<string, number>();
        plans
            .filter((p) => !p.completed)
            .forEach((p) =>
                p.requirements.forEach((r) =>
                    totals.set(r.item, (totals.get(r.item) ?? 0) + r.amount),
                ),
            );
        return [...totals].map(([id, need]) => {
            const item = this.entries().find((e) => e.id === id && e.kind === 'inventory');
            return {
                id,
                name: item?.name ?? 'Missing item',
                game: item?.game ?? '',
                own: item?.quantity ?? 0,
                need,
                missing: Math.max(0, need - (item?.quantity ?? 0)),
                day: item?.day ?? 'Any day',
            };
        });
    }
    /** Moves a category or achievement within its game and persists the complete order atomically. */
    reorderAchievement(id: string, beforeId: string | null, categoryId?: string): boolean {
        if (this.unreadable) {
            return false;
        }
        const source = this.entries().find((e) => e.id === id);
        if (!source || !['achievements', 'achievement-category'].includes(source.kind)) {
            return false;
        }
        const category = categoryId ?? source.category;
        if (
            source.kind === 'achievements' &&
            !this.entries().some(
                (e) =>
                    e.id === category &&
                    e.kind === 'achievement-category' &&
                    e.game === source.game,
            )
        ) {
            return false;
        }
        const siblings = this.entries()
            .filter(
                (e) =>
                    e.id !== id &&
                    e.game === source.game &&
                    e.kind === source.kind &&
                    (source.kind === 'achievement-category' || e.category === category),
            )
            .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
        const index =
            beforeId === null ? siblings.length : siblings.findIndex((e) => e.id === beforeId);
        if (index < 0) {
            return false;
        }
        siblings.splice(index, 0, {
            ...source,
            category: source.kind === 'achievements' ? category : source.category,
        });
        const updates = new Map(siblings.map((e, order) => [e.id, { ...e, order }]));
        return this.replace(this.entries().map((e) => updates.get(e.id) ?? e));
    }
    progress(plan: Entry): number {
        if (plan.completed) {
            return 100;
        }
        const materials = this.materials([plan]);
        const need = materials.reduce((sum, m) => sum + m.need, 0);
        return need
            ? Math.round(
                  (100 * materials.reduce((sum, m) => sum + Math.min(m.own, m.need), 0)) / need,
              )
            : 0;
    }
}
