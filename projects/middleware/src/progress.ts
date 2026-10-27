import { BSON, Collection } from 'mongodb';
import { ProgressSnapshot, validProgressState } from '../../common/player-progress';
import { ApiError } from './repository';
export type ProgressDocument = ProgressSnapshot & { _id: string };
export class ProgressRepository {
    constructor(private readonly collection: Collection<ProgressDocument>) {}
    async read(user: string): Promise<ProgressSnapshot> {
        const doc = await this.collection.findOne({ _id: user });
        return { revision: doc?.revision ?? 0, state: doc?.state ?? {} };
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
        if (BSON.calculateObjectSize({ state }) > 8 * 1024 * 1024) {
            throw new ApiError(413, 'Account progress is too large.');
        }
        if (!validProgressState(state)) {
            throw new ApiError(400, 'Invalid player progress.');
        }
        if (revision === 0) {
            try {
                await this.collection.insertOne({ _id: user, revision: 1, state });
            } catch (error) {
                if ((error as { code?: number }).code === 11000) {
                    throw new ApiError(409, 'Progress changed. Reload before retrying.');
                }
                throw error;
            }
        } else {
            const result = await this.collection.updateOne(
                { _id: user, revision },
                { $set: { state }, $inc: { revision: 1 } },
            );
            if (!result.matchedCount) {
                throw new ApiError(409, 'Progress changed. Reload before retrying.');
            }
        }
        return { revision: revision + 1, state };
    }
}
