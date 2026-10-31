import { MongoClient } from 'mongodb';

/** One client/pool per entry point, shared by that process's repositories. */
export function createDatabaseClient(uri: string): MongoClient {
    return new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
}
