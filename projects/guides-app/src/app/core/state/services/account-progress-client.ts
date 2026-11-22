import type { AuthStore } from '../../auth/auth.store';
import type { ProgressSnapshot } from '@lib/types/player-progress.type';
import { validProgressState } from '@common/player/player-progress';
import { mergeUpdates } from '../merge-updates';

/** Account transport retries conflicting writes without replacing another tab's changes. */
export class AccountProgressClient {
    constructor(private readonly auth: AuthStore | null) {}
    async readProgress(): Promise<ProgressSnapshot> {
        const response = await this.auth!.request('/api/me/progress');
        const data = await response.json() as Record<string, unknown>;
        if (!response.ok || !Number.isSafeInteger(data['revision']) || Number(data['revision']) < 0 || !validProgressState(data['state'], null)) {throw new Error('Could not load account progress.');}
        return data as ProgressSnapshot;
    }
    async writeProgress(base: ProgressSnapshot['state'], revision: number, changes: ProgressSnapshot['state']): Promise<ProgressSnapshot> {
        const edited = { ...base, ...changes };
        let current = { revision: revision, state: base };
        for (let attempt = 0; attempt < 3; attempt++) {
            const state = current.state;
            const merged = mergeUpdates(base, edited, state);
            const updates = Object.fromEntries(Object.entries(merged).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(state[key])));
            const response = await this.auth!.request('/api/me/progress', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ revision: current.revision, changes: updates }) });
            const data = await response.json() as Record<string, unknown>;
            if (!response.ok) {
                if (response.status !== 409) {throw new Error(typeof data['error'] === 'string' ? data['error'] : 'Could not sync account progress.');}
                const latest = await this.readProgress();
                current = latest;
                continue;
            }
            if (!Number.isSafeInteger(data['revision']) || Number(data['revision']) < 0 || !validProgressState(data['state'], null)) {throw new Error('Invalid progress response.');}
            return data as ProgressSnapshot;
        }
        throw new Error('Progress is being updated repeatedly. Try saving again shortly.');
    }
}
