import { createDatabaseClient } from '../src/core/database/connection';
import { readConfig } from "../src/config/environment";
import { GameRepository } from "../src/modules/games/games.repository";

const config = readConfig();
const client = createDatabaseClient(config.uri);
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
