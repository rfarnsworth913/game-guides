import { BSON, Collection } from 'mongodb';
import type { ProgressSnapshot } from "@lib/types/player-progress.type";
import { validProgressState } from "@common/player/player-progress";
import { ApiError } from '../../core/errors/app-error';
import { progressDates } from '@common/player/progress-activity';
export type ProgressDocument = ProgressSnapshot & { _id: string };
export class ProgressRepository {
    constructor(private readonly collection: Collection<ProgressDocument>) {}
    async read(user: string): Promise<ProgressSnapshot> {
        const doc = await this.collection.findOne({ _id: user });
        return { revision: doc?.revision ?? 0, state: doc?.state ?? {}, ...(doc?.gameUpdatedAt ? { gameUpdatedAt: doc.gameUpdatedAt } : {}) };
    }
    async patch(
        user: string,
        revision: number,
        changes: ProgressSnapshot['state'],
    ): Promise<ProgressSnapshot> {
        const current = await this.read(user);
        if (current.revision !== revision) {
            throw new ApiError(409, 'Progress changed in another browser. Reload before retrying.');
        }
        const state = { ...current.state, ...changes };
        const gameUpdatedAt = progressDates(current.state, state, current.gameUpdatedAt);
        if (BSON.calculateObjectSize({ state }) > 8 * 1024 * 1024) {
            throw new ApiError(413, 'Account progress is too large.');
        }
        if (!validProgressState(state, null)) {
            throw new ApiError(400, 'Invalid player progress.');
        }
        if (revision === 0) {
            try {
                await this.collection.insertOne({ _id: user, revision: 1, state, gameUpdatedAt });
            } catch (error) {
                if ((error as { code?: number }).code === 11000) {
                    throw new ApiError(409, 'Progress changed. Reload before retrying.');
                }
                throw error;
            }
        } else {
            const result = await this.collection.updateOne(
                { _id: user, revision },
                { $set: { state, gameUpdatedAt }, $inc: { revision: 1 } },
            );
            if (!result.matchedCount) {
                throw new ApiError(409, 'Progress changed. Reload before retrying.');
            }
        }
        return { revision: revision + 1, state, gameUpdatedAt };
    }
}
