import { MongoClient } from 'mongodb';
import { readConfig } from './config';
import { GameRepository } from './repository';

const config = readConfig();
const client = new MongoClient(config.uri, { serverSelectionTimeoutMS: 5000 });
try {
    await client.connect();
    const db = client.db(config.database);
    await new GameRepository(
        db.collection(config.collection),
        db.collection(`${config.collection}_schema_v1_backup`),
    ).initialize();
    console.log(
        'Game schema migration complete. Original documents are retained in the schema_v1_backup collection.',
    );
} finally {
    await client.close();
}
