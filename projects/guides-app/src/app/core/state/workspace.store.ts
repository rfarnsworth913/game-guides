import { collectionEdit, characterDetailsEdits } from './services/character-edits';
import { storyTemplateFor } from '@common/quests/story-guide';
import { reconcilePreservedFieldRemovals } from '@common/quests/story-preservation';
import { inventoryQuantityEdits } from './services/inventory-edits';
import { mergeTeamEdits } from './services/team-edits';
import { WorkspaceApi } from './services/workspace-api';
import { CatalogClient } from './services/catalog-client';
import { AccountProgressClient } from './services/account-progress-client';
import { GuestProgressStorage } from './services/guest-progress-storage';
import { AuthStore } from "../auth/auth.store";
import type {CraftRequest} from '@lib/types/inventory.type';
import {craftInventory as calculateCraft} from '@common/inventory/inventory-crafting';
import {inventoryItems} from '@common/inventory/inventory-requirements';
import type { Team } from "@lib/types/team.type";
import { TEAM_PROGRESS_ID } from "@lib/constants/team.constants";
import { teamSize, validTeams } from "@common/player/teams";
import type { CharacterCollection, CharacterRules } from "@lib/types/character.type";
import { validCharacterRules } from "@common/characters/characters";
import {equipmentAccountIssues} from '@common/characters/character-equipment';
import { mergeUpdates } from "./merge-updates";
import type { ProgressSnapshot } from "@lib/types/player-progress.type";
import { validProgressState } from "@common/player/player-progress";
import { inject, Injectable, computed, signal } from '@angular/core';
import type { PlayerState, Entry, GameSnapshot } from "@lib/types/workspace.type";

import { GAMES } from "@lib/constants/workspace.constants";
import { validEntries, parseBackup, toCatalog, fromCatalog } from "@common/workspace/workspace";
import { resolveCharacterReferences, editCharacterStory, migrateStoryCharacters, characterStoryProfile } from '@common/characters/character-story';
import { resolveEventReferences, editEventStory, migrateStoryEvents } from '@common/events/event-story';
import { sharedEventState, setEventCompletion } from '@common/events/event-progress';
import { defaultGameOverview, validGameOverview } from '@common/workspace/game-overview';
import type { GameRegistration } from '@lib/types/game-registration.type';
export type { Entry, Kind } from "@lib/types/workspace.type";
export { GAMES } from "@lib/constants/workspace.constants";
export { validEntries, parseBackup } from "@common/workspace/workspace";
const KEY = 'gg-workspace-v1';
@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
    readonly auth = inject(AuthStore, { optional: true });
    readonly canEdit = computed(() => this.auth ? this.auth.user()?.editor === true : true);
    private progressRevision = 0;
    readonly error = signal('');
    readonly entries = signal<Entry[]>([]);
    readonly initialized = signal(false);
    readonly loading = signal(false);
    readonly saving = signal(false);
    readonly games = signal<GameRegistration[]>(GAMES.map(game => defaultGameOverview(game.id)));
    readonly characterRules = signal<Record<string, CharacterRules>>({});
    readonly teams = signal<Record<string, Team[]>>({});
    private snapshots = new Map<string, GameSnapshot>();
    private loadingPromise: Promise<boolean> | null = null;
    private player: Record<string, PlayerState> = {};
    private playerKey(entry: { game: string; id: string; eventId?: string }): string {
        return `${entry.game}/${entry.eventId ?? entry.id}`;
    }
    private readonly api = new WorkspaceApi(this.auth);
    private readonly catalogClient = new CatalogClient(this.api);
    private readonly progressClient = new AccountProgressClient(this.auth);
    private readonly guestStorage = new GuestProgressStorage();
    private readonly request = this.api.request.bind(this.api);
    private readonly snapshot = this.catalogClient.snapshot.bind(this.catalogClient);
    private readonly writeCatalog = this.catalogClient.writeCatalog.bind(this.catalogClient);
    private showSnapshots(): void {
        this.teams.set(Object.fromEntries(this.games().map(game => [game.id, structuredClone(this.player[`${game.id}/${TEAM_PROGRESS_ID}`]?.teams ?? [])])));
        this.characterRules.set(Object.fromEntries([...this.snapshots.values()].filter(game => game.characterRules).map(game => [game.id, game.characterRules!])));
        this.entries.set(
            [...this.snapshots.values()].flatMap((game) => {
                const entries = resolveEventReferences(resolveCharacterReferences(game.entries));
                const events = new Map(entries.filter(entry => entry.kind === 'events').map(event => [event.id, sharedEventState(event, this.player[this.playerKey(event)],
                    entries.filter(entry => entry.eventId === event.id).flatMap(entry => this.player[`${entry.game}/${entry.id}`] ? [this.player[`${entry.game}/${entry.id}`]] : []))]));
                return entries.map(entry => fromCatalog(entry, events.get(entry.eventId ?? (entry.kind === 'events' ? entry.id : '')) ?? this.player[this.playerKey(entry)]));
            }),
        );
    }
    async gameRegistry(): Promise<GameRegistration[]> {
        if (!this.canEdit()) {throw new Error('Editor access is required.');}
        const data = await this.request('games/registry');
        if (!data || typeof data !== 'object' || !('games' in data) || !Array.isArray(data.games) || !data.games.every(validGameOverview)) {
            throw new Error('Invalid game registry response.');
        }
        return data.games as GameRegistration[];
    }
    async authorizeGameWorkspace(id: string, feature: string): Promise<void> {
        await this.request(`games/${encodeURIComponent(id)}/workspace?feature=${encodeURIComponent(feature)}`);
    }
    async saveGameOverview(game: GameRegistration, create = false, remove = false): Promise<GameRegistration> {
        if (!this.canEdit() || this.saving() || this.loading()) {throw new Error('Editor access and an idle workspace are required.');}
        if (!validGameOverview(game)) {throw new Error('Complete the required game fields and valid image URLs.');}
        this.saving.set(true);
        try {
            const data = await this.request(create ? 'games' : `games/${game.id}${remove ? '' : '/overview'}`,
                remove ? { revision: game.revision } : game, create ? 'POST' : remove ? 'DELETE' : 'PUT');
            if (!validGameOverview(data) || data.id !== game.id) {throw new Error('Invalid saved game response.');}
            this.snapshots.set(data.id, this.snapshot(await this.request(`games/${data.id}`)));
            this.games.set([...this.games().filter(item => item.id !== data.id), data].sort((a, b) => a.name.localeCompare(b.name)));
            this.showSnapshots();
            return data;
        } finally {this.saving.set(false);}
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
            if (!signedIn) {this.player = this.guestStorage.read();}
            const legacyRaw = !signedIn ? localStorage.getItem(KEY) : null;
            const legacy = legacyRaw ? parseBackup(legacyRaw, null) : [];
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
                new Set(snapshots.map(game => game.id)).size !== snapshots.length
            ) {
                throw new Error('Middleware returned an incomplete game catalog.');
            }
            this.snapshots = new Map(snapshots.map((game) => [game.id, game]));
            this.games.set(snapshots.map(game => game.overview!).sort((a, b) => a.name.localeCompare(b.name)));
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
        if (!validEntries(entries, this.games().map(game => game.id))) {
            this.error.set('Invalid workspace entries.');
            return false;
        }
        if (ruleUpdates && !Object.entries(ruleUpdates).every(([game, rules]) => this.games().some(item => item.id === game) && validCharacterRules(rules))) {
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
                    ...(entry.equipmentInstances ? {equipmentInstances:entry.equipmentInstances} : {}),
                };
            }
            for (const game of new Set(entries.map(entry => entry.game))) {
                const issues = equipmentAccountIssues(entries.filter(entry => entry.game === game).map(toCatalog),player,this.characterRules()[game]);
                if (issues.length) {throw new Error(issues.join(' '));}
            }
            if (!this.auth?.user()) {
                const merged = this.guestStorage.merge(this.player, player);
                for (const game of new Set(entries.map(entry => entry.game))) {
                    const issues = equipmentAccountIssues(entries.filter(entry => entry.game === game).map(toCatalog),merged,this.characterRules()[game]);
                    if (issues.length) {throw new Error(issues.join(' '));}
                }
                this.guestStorage.write(merged);
                this.player = merged;
            }
            for (const game of this.games()) {
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
                if (!this.canEdit()) {throw new Error('An editor account is required to change guide content.');}
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
        if (!this.canEdit() || !this.initialized() || this.saving() || this.loading() || !validCharacterRules(rules)) {return false;}
        const base = this.snapshots.get(game);
        if (!base) {return false;}
        this.saving.set(true); this.error.set('');
        try {
            const saved = await this.writeCatalog(base, base.entries, rules);
            this.snapshots.set(game, saved); this.showSnapshots(); return true;
        } catch (error) { this.error.set(error instanceof Error ? error.message : 'Could not save character rules.'); return false; }
        finally { this.saving.set(false); }
    }
    async saveCharacterCollection(id: string, collection: CharacterCollection): Promise<boolean> {
        try { return await this.save(collectionEdit(this.entries(), this.characterRules(), id, collection)); }
        catch (error) {this.error.set(error instanceof Error ? error.message : 'Invalid character collection.'); return false;}
    }
    async saveCharacterDetails(id: string, collection: CharacterCollection, inventory: Entry[]): Promise<boolean> {
        try { return await this.replace(characterDetailsEdits(this.entries(), this.characterRules(), id, collection, inventory)); }
        catch (error) {this.error.set(error instanceof Error ? error.message : 'Invalid character details.'); return false;}
    }
    async saveInventoryQuantities(game: string, changes: Record<string, number>): Promise<boolean> {
        try { return await this.replace(inventoryQuantityEdits(this.entries(), game, changes)); }
        catch (error) {this.error.set(error instanceof Error ? error.message : 'Invalid inventory quantities.'); return false;}
    }
    async craftInventory(game: string, request: CraftRequest): Promise<boolean> {
        if (this.saving() || this.loading() || !this.initialized()) {return false;}
        this.error.set('');
        const rules = this.characterRules()[game];
        try {
            if (!rules?.inventory) {throw new Error('No crafting recipes configured.');}
            if (!this.auth?.user()) {
                const reserved = new Map(inventoryItems(this.entries(),game,rules).map(view => [view.item.id,view.required]));
                return await this.saveInventoryQuantities(game,calculateCraft(this.entries(),game,rules.inventory,request,reserved));
            }
            this.saving.set(true);
            const result = await this.request(`me/inventory/${game}/craft`,{...request,revision:this.progressRevision},'POST') as ProgressSnapshot;
            if (!Number.isSafeInteger(result.revision) || !validProgressState(result.state,null)) {throw new Error('Invalid inventory response. Reload to verify your inventory before retrying.');}
            this.player = result.state; this.progressRevision = result.revision; this.showSnapshots();
            return true;
        } catch (error) {this.error.set(error instanceof Error ? error.message : 'Crafting failed.'); return false;}
        finally {this.saving.set(false);}
    }
    async saveTeam(game: string, team: Team): Promise<boolean> {
        return this.restoreTeams({ [game]: [team] });
    }
    async deleteTeam(game: string, id: string): Promise<boolean> {
        return this.persistTeams({ [game]: (this.teams()[game] ?? []).filter(team => team.id !== id) });
    }
    async restoreTeams(value: unknown): Promise<boolean> {
        try { return await this.persistTeams(mergeTeamEdits(value, this.entries(), this.games().map(game => game.id), this.characterRules(), this.teams())); }
        catch (error) {this.error.set(error instanceof Error ? error.message : 'Invalid team data.'); return false;}
    }
    private async persistTeams(updates: Record<string, Team[]>): Promise<boolean> {
        if (this.saving() || this.loading() || !this.initialized()) {return false;}
        if (!Object.entries(updates).every(([game, teams]) => this.games().some(item => item.id === game) && validTeams(teams))) { this.error.set('Invalid team data.'); return false; }
        const changes = Object.fromEntries(Object.entries(updates).map(([game, teams]) => [`${game}/${TEAM_PROGRESS_ID}`, { completed: false, quantity: 0, target: 0, teams: structuredClone(teams) }]));
        this.saving.set(true); this.error.set('');
        try {
            if (this.auth?.user()) {
                const progress = await this.writeProgress(changes);
                this.player = progress.state; this.progressRevision = progress.revision;
            } else {
                const merged = this.guestStorage.merge(this.player, { ...this.player, ...changes });
                this.guestStorage.write(merged);
                this.player = merged;
            }
            this.showSnapshots(); return true;
        } catch (error) { this.error.set(error instanceof Error ? error.message : 'Could not save teams.'); return false; }
        finally { this.saving.set(false); }
    }
    private readProgress(): Promise<ProgressSnapshot> {
        return this.progressClient.readProgress();
    }
    private writeProgress(changes: ProgressSnapshot['state']): Promise<ProgressSnapshot> {
        return this.progressClient.writeProgress(this.player, this.progressRevision, changes);
    }
    guestImport(): ProgressSnapshot['state'] {
        const guestState = this.guestStorage.read();
        const result: ProgressSnapshot['state'] = {};
        for (const entry of this.entries()) {
            if (entry.eventId) {continue;}
            const key = this.playerKey(entry);
            const legacy = entry.kind === 'events' ? this.entries().filter(placement => placement.game === entry.game && placement.eventId === entry.id)
                .flatMap(placement => guestState[`${entry.game}/${placement.id}`] ? [guestState[`${entry.game}/${placement.id}`]] : []) : [];
            const guest = entry.kind === 'events' && (guestState[key] || legacy.length) ? sharedEventState(entry, guestState[key], legacy) : guestState[key];
            if (!guest) {continue;}
            const account = this.player[key];
            // Include historical cycle keys and old row IDs; importing must not erase earlier tracking.
            const completion = Object.fromEntries([...new Set([...Object.keys(guest.storyRowCompletion ?? {}), ...Object.keys(account?.storyRowCompletion ?? {})])]
                .filter(key => guest.storyRowCompletion?.[key] || account?.storyRowCompletion?.[key]).map(key => [key, true]));
            result[key] = { completed: guest.completed || account?.completed || false,
                quantity: Math.max(guest.quantity, account?.quantity ?? 0), target: Math.max(guest.target, account?.target ?? 0), storyRowCompletion: completion };
            // Explicit account builds take precedence; never combine two different equipment sets.
            const collection = account?.characterCollection ?? guest.characterCollection;
            if (collection) {result[key].characterCollection = structuredClone(collection);}
        }
        for (const game of this.games()) {
            const key = `${game.id}/${TEAM_PROGRESS_ID}`;
            const incoming: Team[] | undefined = guestState[key]?.teams;
            if (!incoming) {continue;}
            const existing = this.player[key]?.teams ?? [];
            const teams = new Map(existing.map(team => [team.id, team]));
            for (const team of incoming) {
                if (!teams.has(team.id) && team.members.length <= teamSize(this.characterRules()[game.id]) && team.members.every(id => (result[`${game.id}/${id}`] ?? this.player[`${game.id}/${id}`])?.characterCollection?.owned)) {teams.set(team.id, structuredClone(team));}
            }
            result[key] = { completed: false, quantity: 0, target: 0, teams: [...teams.values()] };
        }
        return result;
    }
    async importGuestProgress(): Promise<boolean> {
        if (!this.auth?.user() || this.saving() || !this.initialized()) {return false;}
        this.saving.set(true); this.error.set('');
        try {
            const progress = await this.writeProgress(this.guestImport());
            this.player = progress.state; this.progressRevision = progress.revision; this.showSnapshots();
            return true;
        } catch (error) { this.error.set(error instanceof Error ? error.message : 'Import failed.'); return false; }
        finally { this.saving.set(false); }
    }
    async save(entry: Entry): Promise<boolean> {
        if (entry.kind === 'story') {reconcilePreservedFieldRemovals(entry);}
        if (entry.kind === 'characters' && entry.characterInformation && entry.characterDefinition) {entry = editCharacterStory(entry, characterStoryProfile(entry));}
        let entries = [...this.entries().filter((e) => e.id !== entry.id), entry];
        const sharedEvent = entry.kind === 'events' ? entry : entry.eventId ? this.entries().find(item => item.kind === 'events' && item.id === entry.eventId && item.game === entry.game) : null;
        if (sharedEvent) {
            const previous = this.entries().find(item => item.id === entry.id);
            let state: PlayerState = { completed: entry.completed, quantity: entry.quantity, target: entry.target, ...(entry.storyRowCompletion ? { storyRowCompletion: entry.storyRowCompletion } : {}) };
            if (entry.kind === 'events' && previous && entry.completed !== previous.completed) {
                try {state = setEventCompletion(sharedEvent, entry.completed, state);} catch (error) {this.error.set(error instanceof Error ? error.message : 'Invalid event progress.'); return false;}
            }
            state = sharedEventState(sharedEvent, state);
            entries = entries.map(item => item.game === sharedEvent.game && (item.id === sharedEvent.id || item.eventId === sharedEvent.id) ? { ...item, ...state } : item);
        }
        if (entry.kind === 'story' && entry.characterId && entry.storyContent) {
            entries = entries.map(item => item.kind === 'characters' && item.game === entry.game && item.id === entry.characterId ? editCharacterStory(item, entry.storyContent!) : item);
        }
        if (entry.kind === 'story' && entry.category === 'character-information' && !entry.eventId) {
            if (entry.characterId && entry.characterInformation) {
                const previous = this.entries().find(item => item.id === entry.id);
                if (previous?.characterId !== entry.characterId || JSON.stringify(previous.characterInformation) !== JSON.stringify(entry.characterInformation)) {
                    entries = entries.map(item => item.kind === 'characters' && item.game === entry.game && item.id === entry.characterId ? editCharacterStory(item, entry.characterInformation!) : item);
                }
            } else if (!entry.characterId) {
                try {
                    const migrated = migrateStoryCharacters(entries.map(toCatalog));
                    const drafts = new Map(entries.map(item => [item.id, item]));
                    entries = resolveCharacterReferences(migrated.entries).map(item => fromCatalog(item, drafts.get(item.id) ?? this.player[this.playerKey(item)]));
                } catch (error) {this.error.set(error instanceof Error ? error.message : 'Could not create the shared character.'); return false;}
            }
        }
        if (entry.kind === 'story' && (entry.eventId || entry.category === 'events') && !entry.characterId) {
            const profile = entry.storyContent ?? storyTemplateFor(entry);
            if (entry.eventId && profile) {
                const previous = this.entries().find(item => item.id === entry.id);
                if (previous?.eventId !== entry.eventId || previous.name !== entry.name || JSON.stringify(storyTemplateFor(previous)) !== JSON.stringify(profile)) {
                    entries = entries.map(item => item.kind === 'events' && item.game === entry.game && item.id === entry.eventId ? editEventStory(item, profile, entry.name) : item);
                }
            } else if (!entry.eventId) {
                try {
                    const migrated = migrateStoryEvents(entries.map(toCatalog));
                    const drafts = new Map(entries.map(item => [item.id, item]));
                    entries = resolveEventReferences(resolveCharacterReferences(migrated.entries)).map(item => fromCatalog(item, drafts.get(item.id) ?? this.player[this.playerKey(item)]));
                } catch (error) {this.error.set(error instanceof Error ? error.message : 'Could not create the shared event.'); return false;}
            }
        }
        return this.replace(resolveEventReferences(entries));
    }
    async resetStoryProgress(game: string): Promise<boolean> {
        return this.replace(this.entries().map((entry) =>
            entry.game === game && (entry.kind === 'story' || entry.kind === 'story-category' || (entry.kind === 'events' && !!entry.eventStory))
                ? { ...entry, completed: false, storyRowCompletion: {} }
                : entry,
        ));
    }
    async remove(id: string): Promise<boolean> {
        if (this.entries().some(entry => entry.eventId === id)) {this.error.set('This event is referenced by a story guide. Remove or change its guide references first.'); return false;}
        if (this.entries().some(entry => entry.characterId === id)) {this.error.set('This character is referenced by a story guide. Remove or change its guide references first.'); return false;}
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
