import { AuthStore } from './auth.store';
import { CharacterCollection, CharacterRules, characterCollectionFits, validCharacterCollection, validCharacterRules } from '../../../../common/characters';
import { mergeUpdates } from './merge-updates';
import { ProgressSnapshot, validProgressState } from '../../../../common/player-progress';
import { Inject, Injectable, Optional, computed, signal } from '@angular/core';
import { validRowCompletion } from '../../../../common/story-template';
import type { PlayerState } from '../../../../common/workspace';

import {
    Entry,
    GAMES,
    validEntries,
    parseBackup,
    toCatalog,
    fromCatalog,
    GameSnapshot,
    validCatalog,
} from '../../../../common/workspace';
export type { Entry, Kind } from '../../../../common/workspace';
export { GAMES, validEntries, parseBackup } from '../../../../common/workspace';
const KEY = 'gg-workspace-v1';
class RequestError extends Error {
    constructor(readonly status: number, message: string) { super(message); }
}
@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
    constructor(@Optional() @Inject(AuthStore) readonly auth: AuthStore | null = null) {}
    readonly canEdit = computed(() => this.auth ? this.auth.user()?.editor === true : true);
    private progressRevision = 0;
    readonly error = signal('');
    readonly entries = signal<Entry[]>([]);
    readonly initialized = signal(false);
    readonly loading = signal(false);
    readonly saving = signal(false);
    readonly characterRules = signal<Record<string, CharacterRules>>({});
    private snapshots = new Map<string, GameSnapshot>();
    private loadingPromise: Promise<boolean> | null = null;
    private player: Record<string, PlayerState> = {};
    private playerKey(entry: { game: string; id: string }): string {
        return `${entry.game}/${entry.id}`;
    }
    private async request(path: string, body?: unknown): Promise<unknown> {
        const init: RequestInit = {
            method: body ? 'PUT' : 'GET',
            ...(body
                ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
                : {}),
            signal: AbortSignal.timeout(10000),
        };
        const response = this.auth ? await this.auth.request(`/api/${path}`, init) : await fetch(`/api/${path}`, init);
        const data: unknown = await response.json();
        if (!response.ok) {
            throw new RequestError(response.status,
                data &&
                typeof data === 'object' &&
                'error' in data &&
                typeof data.error === 'string'
                    ? data.error
                    : 'Middleware request failed.',
            );
        }
        return data;
    }
    private async writeCatalog(base: GameSnapshot, edited: GameSnapshot['entries'], editedRules?: CharacterRules): Promise<GameSnapshot> {
        let current = base;
        let entries = edited;
        let rules = editedRules;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                return this.snapshot(await this.request(`games/${base.id}/catalog`, { revision: current.revision, entries, ...(rules ? { characterRules: rules } : {}) }));
            } catch (error) {
                if (!(error instanceof RequestError) || error.status !== 409) throw error;
                current = this.snapshot(await this.request(`games/${base.id}`));
                if (current.id !== base.id) throw new Error('Invalid game response.');
                const index = (values: GameSnapshot['entries']) => Object.fromEntries(values.map(entry => [entry.id, entry]));
                entries = Object.values(mergeUpdates(index(base.entries), index(edited), index(current.entries)));
                if (editedRules) rules = mergeUpdates(base.characterRules, editedRules, current.characterRules);
                if (!validCatalog(entries, base.id)) throw new Error('Another tab changed related guide content. Review the latest guide before retrying.');
            }
        }
        throw new Error('This game is being updated repeatedly. Your edit is still open; try saving again shortly.');
    }
    private snapshot(value: unknown): GameSnapshot {
        if (
            !value ||
            typeof value !== 'object' ||
            !('id' in value) ||
            typeof value.id !== 'string' ||
            !('revision' in value) ||
            !Number.isSafeInteger(value.revision) ||
            Number(value.revision) < 0 ||
            !('entries' in value) ||
            !validCatalog(value.entries, value.id)
            || ('characterRules' in value && !validCharacterRules(value.characterRules))
        ) {
            throw new Error('Invalid game data received from middleware.');
        }
        return {
            id: value.id,
            name: GAMES.find((g) => g.id === value.id)?.name ?? value.id,
            revision: Number(value.revision),
            entries: value.entries,
            ...('characterRules' in value ? { characterRules: value.characterRules as CharacterRules } : {}),
        };
    }
    private showSnapshots(): void {
        this.characterRules.set(Object.fromEntries([...this.snapshots.values()].filter(game => game.characterRules).map(game => [game.id, game.characterRules!])));
        this.entries.set(
            [...this.snapshots.values()].flatMap((game) =>
                game.entries.map((entry) => fromCatalog(entry, this.player[this.playerKey(entry)])),
            ),
        );
    }
    /** Fetch definitions once, and migrate old browser catalogs only after a successful server write. */
    initialize(): Promise<boolean> {
        if (this.loadingPromise) {
            return this.loadingPromise;
        }
        this.loadingPromise = this.load().finally(() => {
            this.loadingPromise = null;
        });
        return this.loadingPromise;
    }
    private async load(): Promise<boolean> {
        if (this.saving()) {
            return false;
        }
        this.loading.set(true);
        this.initialized.set(false);
        this.entries.set([]);
        this.error.set('');
        try {
            await this.auth?.initialize();
            this.player = {};
            const signedIn = !!this.auth?.user();
            const progressRaw = signedIn ? null : localStorage.getItem('gg-player-v1');
            if (progressRaw) {
                const parsed = JSON.parse(progressRaw) as { version?: unknown; state?: unknown };
                if (
                    parsed.version !== 1 ||
                    !parsed.state ||
                    typeof parsed.state !== 'object' ||
                    Array.isArray(parsed.state)
                ) {
                    throw new Error('Invalid local player data. Import a backup to recover it.');
                }
                for (const state of Object.values(parsed.state as Record<string, unknown>)) {
                    if (
                        !state ||
                        typeof state !== 'object' ||
                        !('completed' in state) ||
                        typeof state.completed !== 'boolean' ||
                        !('quantity' in state) ||
                        !Number.isFinite(state.quantity) ||
                        Number(state.quantity) < 0 ||
                        !('target' in state) ||
                        !Number.isFinite(state.target) ||
                        Number(state.target) < 0 ||
                        !validRowCompletion(
                            'storyRowCompletion' in state ? state.storyRowCompletion : undefined,
                        ) || ('characterCollection' in state && !validCharacterCollection(state.characterCollection))
                    ) {
                        throw new Error(
                            'Invalid local player data. Your stored data has not been overwritten.',
                        );
                    }
                }
                this.player = parsed.state as typeof this.player;
            }
            const legacyRaw = !signedIn ? localStorage.getItem(KEY) : null;
            const legacy = legacyRaw ? parseBackup(legacyRaw) : [];
            const response = await this.request('games');
            if (
                !response ||
                typeof response !== 'object' ||
                !('games' in response) ||
                !Array.isArray(response.games)
            ) {
                throw new Error('Invalid middleware response.');
            }
            const snapshots = response.games.map((game: unknown) => this.snapshot(game));
            if (
                snapshots.length !== GAMES.length ||
                !GAMES.every((game) => snapshots.some((snapshot) => snapshot.id === game.id))
            ) {
                throw new Error('Middleware returned an incomplete game catalog.');
            }
            this.snapshots = new Map(snapshots.map((game) => [game.id, game]));
            if (legacy.length) {
                for (const entry of legacy) {
                    this.player[this.playerKey(entry)] ??= {
                        completed: entry.completed,
                        quantity: entry.quantity,
                        target: entry.target,
                        ...(entry.storyRowCompletion
                            ? { storyRowCompletion: entry.storyRowCompletion }
                            : {}),
                    };
                }
                // Persist completion first; retain the original legacy key until every game has migrated.
                localStorage.setItem(
                    'gg-player-v1',
                    JSON.stringify({ version: 1, state: this.player }),
                );
                for (const game of this.canEdit() ? snapshots : []) {
                    const merged = new Map(game.entries.map((entry) => [entry.id, entry]));
                    for (const entry of legacy.filter((e) => e.game === game.id)) {
                        if (!merged.has(entry.id)) {
                            merged.set(entry.id, toCatalog(entry));
                        }
                    }
                    if (merged.size !== game.entries.length) {
                        const saved = this.snapshot(
                            await this.request(`games/${game.id}/catalog`, {
                                revision: game.revision,
                                entries: [...merged.values()],
                            }),
                        );
                        this.snapshots.set(game.id, saved);
                    }
                }
            }
            if (legacyRaw && this.canEdit()) {
                localStorage.removeItem(KEY);
            }
            if (signedIn) {
                const progress = await this.readProgress();
                this.player = progress.state; this.progressRevision = progress.revision;
            }
            this.showSnapshots();
            this.initialized.set(true);
            return true;
        } catch (error) {
            this.error.set(
                `${
                    error instanceof Error ? error.message : 'Could not load game data.'
                } Start the app with npm start, then retry. Existing local data has been kept.`,
            );
            return false;
        } finally {
            this.loading.set(false);
        }
    }
    async replace(entries: Entry[], ruleUpdates?: Record<string, CharacterRules>): Promise<boolean> {
        if (!this.initialized() || this.loading() || this.saving()) {
            this.error.set('Game data is not ready or a save is in progress. Please retry.');
            return false;
        }
        if (!validEntries(entries)) {
            this.error.set('Invalid workspace entries.');
            return false;
        }
        if (ruleUpdates && !Object.entries(ruleUpdates).every(([game, rules]) => GAMES.some(item => item.id === game) && validCharacterRules(rules))) {
            this.error.set('Invalid game character rules.'); return false;
        }
        this.saving.set(true);
        this.error.set('');
        let wroteCatalog = false;
        try {
            const player = { ...this.player };
            for (const entry of entries) {
                player[this.playerKey(entry)] = {
                    completed: entry.completed,
                    quantity: entry.quantity,
                    target: entry.target,
                    ...(entry.storyRowCompletion
                        ? { storyRowCompletion: entry.storyRowCompletion }
                        : {}),
                    ...(entry.characterCollection ? { characterCollection: entry.characterCollection } : {}),
                };
            }
            if (!this.auth?.user()) {
                const raw = localStorage.getItem('gg-player-v1');
                const latest = raw ? JSON.parse(raw) : { version: 1, state: {} };
                if (latest.version !== 1 || !validProgressState(latest.state)) throw new Error('Invalid local player data. Your stored data has not been overwritten.');
                const merged = mergeUpdates(this.player, player, latest.state);
                localStorage.setItem('gg-player-v1', JSON.stringify({ version: 1, state: merged }));
                this.player = merged;
            }
            for (const game of GAMES) {
                const snapshot = this.snapshots.get(game.id)!;
                const catalog = entries
                    .filter((entry) => entry.game === game.id)
                    .map(toCatalog)
                    .sort((a, b) => a.id.localeCompare(b.id));
                const previous = snapshot.entries
                    .map((entry) => toCatalog(fromCatalog(entry)))
                    .sort((a, b) => a.id.localeCompare(b.id));
                const editedRules = ruleUpdates?.[game.id];
                if (JSON.stringify(catalog) === JSON.stringify(previous) && (!editedRules || JSON.stringify(editedRules) === JSON.stringify(snapshot.characterRules))) {
                    continue;
                }
                if (!this.canEdit()) throw new Error('An editor account is required to change guide content.');
                const saved = await this.writeCatalog(snapshot, catalog, editedRules);
                this.snapshots.set(game.id, saved);
                wroteCatalog = true;
            }
            if (this.auth?.user()) {
                const changes = Object.fromEntries(Object.entries(player).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(this.player[key])));
                if (Object.keys(changes).length) {
                    const progress = await this.writeProgress(changes);
                    this.player = progress.state; this.progressRevision = progress.revision;
                }
            }
            this.showSnapshots();
            return true;
        } catch (error) {
            this.showSnapshots();
            this.error.set(
                `Could not save game data: ${
                    error instanceof Error ? error.message : 'Please retry.'
                }${
                    wroteCatalog
                        ? ' Some games were saved before this error; reload before retrying the rest.'
                        : ''
                } ${this.auth?.user() ? 'Account progress was not overwritten.' : 'Player progress remains on this device.'}`,
            );
            return false;
        } finally {
            this.saving.set(false);
        }
    }
    clearAccountProgress(): void {
        this.player = {}; this.progressRevision = 0;
        this.entries.set([]); this.initialized.set(false);
    }
    async saveCharacterRules(game: string, rules: CharacterRules): Promise<boolean> {
        if (!this.canEdit() || !this.initialized() || this.saving() || this.loading() || !validCharacterRules(rules)) return false;
        const base = this.snapshots.get(game);
        if (!base) return false;
        this.saving.set(true); this.error.set('');
        try {
            const saved = await this.writeCatalog(base, base.entries, rules);
            this.snapshots.set(game, saved); this.showSnapshots(); return true;
        } catch (error) { this.error.set(error instanceof Error ? error.message : 'Could not save character rules.'); return false; }
        finally { this.saving.set(false); }
    }
    async saveCharacterCollection(id: string, collection: CharacterCollection): Promise<boolean> {
        const entry = this.entries().find(entry => entry.id === id && entry.kind === 'characters');
        const rules = entry && this.characterRules()[entry.game];
        if (!entry || !validCharacterCollection(collection) || ((collection.owned || collection.target) && (!rules || !characterCollectionFits(collection, rules, entry.characterDefinition)))) {
            this.error.set('Check this character\'s level, equipment, and progression against the game rules.'); return false;
        }
        return this.save({ ...entry, characterCollection: structuredClone(collection) });
    }
    private async readProgress(): Promise<ProgressSnapshot> {
        const response = await this.auth!.request('/api/me/progress');
        const data = await response.json();
        if (!response.ok || !Number.isSafeInteger(data.revision) || data.revision < 0 || !validProgressState(data.state)) throw new Error('Could not load account progress.');
        return data as ProgressSnapshot;
    }
    private async writeProgress(changes: ProgressSnapshot['state']): Promise<ProgressSnapshot> {
        const base = this.player;
        const edited = { ...base, ...changes };
        let current = { revision: this.progressRevision, state: base };
        for (let attempt = 0; attempt < 3; attempt++) {
            const merged = mergeUpdates(base, edited, current.state);
            const updates = Object.fromEntries(Object.entries(merged).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(current.state[key])));
            const response = await this.auth!.request('/api/me/progress', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ revision: current.revision, changes: updates }) });
            const data = await response.json();
            if (!response.ok) {
                if (response.status !== 409) throw new Error(data.error || 'Could not sync account progress.');
                current = await this.readProgress();
                continue;
            }
            if (!Number.isSafeInteger(data.revision) || data.revision < 0 || !validProgressState(data.state)) throw new Error('Invalid progress response.');
            return data as ProgressSnapshot;
        }
        throw new Error('Progress is being updated repeatedly. Try saving again shortly.');
    }
    guestImport(): ProgressSnapshot['state'] {
        const raw = localStorage.getItem('gg-player-v1');
        if (!raw) return {};
        const data = JSON.parse(raw);
        if (data.version !== 1 || !validProgressState(data.state)) throw new Error('Invalid guest progress. Export a backup before continuing.');
        const result: ProgressSnapshot['state'] = {};
        for (const entry of this.entries()) {
            const key = this.playerKey(entry); const guest = data.state[key];
            if (!guest) continue;
            const account = this.player[key];
            // Include historical cycle keys and old row IDs; importing must not erase earlier tracking.
            const completion = Object.fromEntries([...new Set([...Object.keys(guest.storyRowCompletion ?? {}), ...Object.keys(account?.storyRowCompletion ?? {})])]
                .filter(key => guest.storyRowCompletion?.[key] || account?.storyRowCompletion?.[key]).map(key => [key, true]));
            result[key] = { completed: guest.completed || account?.completed || false,
                quantity: Math.max(guest.quantity, account?.quantity ?? 0), target: Math.max(guest.target, account?.target ?? 0), storyRowCompletion: completion };
            // Explicit account builds take precedence; never combine two different equipment sets.
            const collection = account?.characterCollection ?? guest.characterCollection;
            if (collection) result[key].characterCollection = structuredClone(collection);
        }
        return result;
    }
    async importGuestProgress(): Promise<boolean> {
        if (!this.auth?.user() || this.saving() || !this.initialized()) return false;
        this.saving.set(true); this.error.set('');
        try {
            const progress = await this.writeProgress(this.guestImport());
            this.player = progress.state; this.progressRevision = progress.revision; this.showSnapshots();
            return true;
        } catch (error) { this.error.set(error instanceof Error ? error.message : 'Import failed.'); return false; }
        finally { this.saving.set(false); }
    }
    async save(entry: Entry): Promise<boolean> {
        return this.replace([...this.entries().filter((e) => e.id !== entry.id), entry]);
    }
    async resetStoryProgress(game: string): Promise<boolean> {
        return this.replace(this.entries().map((entry) =>
            entry.game === game && (entry.kind === 'story' || entry.kind === 'story-category')
                ? { ...entry, completed: false, storyRowCompletion: {} }
                : entry,
        ));
    }
    async remove(id: string): Promise<boolean> {
        return this.replace(
            this.entries()
                .filter(
                    (e) =>
                        e.id !== id &&
                        !(e.kind === 'achievements' && e.category === id) &&
                        !(e.kind === 'story' && e.storySection === id),
                )
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
    async reorderAchievement(
        id: string,
        beforeId: string | null,
        categoryId?: string,
    ): Promise<boolean> {
        if (!this.initialized()) {
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
