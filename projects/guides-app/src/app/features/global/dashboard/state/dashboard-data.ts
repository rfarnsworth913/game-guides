import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceApi } from '../../../../core/state/services/workspace-api';
import { AccountProgressClient } from '../../../../core/state/services/account-progress-client';
import { GuestProgressStorage } from '../../../../core/state/services/guest-progress-storage';
import { StoryPositionStore } from '../../../gacha/story-guide/state/story-position.store';
import { setEventCompletion } from '@common/events/event-progress';
import type { DashboardEvents, DashboardSummary } from '@lib/types/dashboard.type';
import type { Entry } from '@lib/types/workspace.type';

/** A disposable projection over existing personal records; writes use the calendar's progress transport. */
@Injectable({ providedIn: 'root' })
export class DashboardData {
    private readonly auth = inject(AuthStore);
    private readonly positions = inject(StoryPositionStore);
    private readonly api = new WorkspaceApi(this.auth);
    private readonly account = new AccountProgressClient(this.auth);
    private readonly guest = new GuestProgressStorage();
    readonly summary = signal<DashboardSummary>({ games: [], errors: [], generatedAt: '' });
    readonly events = signal<DashboardEvents>({ entries: [], errors: [] });
    readonly summaryLoading = signal(false);
    readonly eventsLoading = signal(false);
    readonly summaryError = signal('');
    readonly eventsError = signal('');
    readonly saveError = signal('');
    readonly saving = signal(false);
    private scope = new AbortController();
    private game = '';
    private ready = { summary: false, events: false };
    private readonly requests: Partial<Record<'summary' | 'events', AbortController>> = {};
    constructor() {inject(DestroyRef).onDestroy(() => this.scope.abort());}
    load(game: string): void {
        this.scope.abort(); this.scope = new AbortController(); this.game = game;
        this.ready = { summary: false, events: false };
        this.summary.set({ games: [], errors: [], generatedAt: '' }); this.events.set({ entries: [], errors: [] });
        this.saveError.set(''); this.saving.set(false);
        this.refreshSummary().catch(() => this.summaryError.set('Could not load summaries.')); this.refreshEvents().catch(() => this.eventsError.set('Could not load tasks.'));
    }
    async refreshSummary(): Promise<void> {await this.fetch('summary');}
    async refreshEvents(): Promise<void> {await this.fetch('events');}
    private async fetch(kind: 'summary' | 'events'): Promise<void> {
        this.requests[kind]?.abort();
        const request = new AbortController(); this.requests[kind] = request;
        const signal = AbortSignal.any([this.scope.signal, request.signal]);
        const loading = kind === 'summary' ? this.summaryLoading : this.eventsLoading;
        const error = kind === 'summary' ? this.summaryError : this.eventsError;
        // Loaded widgets stay visible during follow-up requests, including completion refreshes.
        loading.set(!this.ready[kind]); error.set('');
        try {
            const body = { positions: this.positions.positions(), ...(!this.auth.user() ? { state: this.guest.read(), gameUpdatedAt: this.guest.activity() } : {}) };
            const response = await this.api.request(`dashboard/${kind}${this.game ? '/' + this.game : ''}`, body, 'POST', signal);
            if (signal.aborted) {return;}
            if (!response || typeof response !== 'object' || !('errors' in response) || !Array.isArray(response.errors)) {throw new Error('Invalid dashboard response.');}
            if (kind === 'summary' && 'games' in response && Array.isArray(response.games)) {this.summary.set(response as DashboardSummary);}
            else if (kind === 'events' && 'entries' in response && Array.isArray(response.entries)) {this.events.set(response as DashboardEvents);}
            else {throw new Error('Invalid dashboard response.');}
            this.ready[kind] = true;
        } catch (reason) {if (!signal.aborted) {error.set(reason instanceof Error ? reason.message : 'Could not load this widget.');}}
        finally {if (!signal.aborted) {loading.set(false);}}
    }
    async toggle(entry: Entry): Promise<void> {
        if (this.saving()) {return;}
        const scope = this.scope;
        this.saving.set(true); this.saveError.set('');
        try {
            const base = this.auth.user() ? await this.account.readProgress() : { revision: 0, state: this.guest.read() };
            if (scope.signal.aborted) {return;}
            const key = `${entry.game}/${entry.id}`;
            const change = setEventCompletion(entry, !entry.completed, base.state[key] ?? {
                completed: entry.completed, quantity: entry.quantity, target: entry.target,
                ...(entry.storyRowCompletion ? { storyRowCompletion: entry.storyRowCompletion } : {}),
            });
            if (this.auth.user()) {await this.account.writeProgress(base.state, base.revision, { [key]: change });}
            else {this.guest.write(this.guest.merge(base.state, { ...base.state, [key]: change }));}
            if (scope.signal.aborted) {return;}
            this.events.update(value => ({ ...value, entries: value.entries.map(item => item.game === entry.game && item.id === entry.id ? { ...item, ...change } : item) }));
            this.refreshSummary().catch(() => this.summaryError.set('Could not refresh summaries.'));
        } catch (reason) {if (!scope.signal.aborted) {this.saveError.set(reason instanceof Error ? reason.message : 'Could not save completion. Please retry.');}}
        finally {if (!scope.signal.aborted) {this.saving.set(false);}}
    }
}
