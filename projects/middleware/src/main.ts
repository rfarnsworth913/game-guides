import { MongoClient } from 'mongodb';
import { readConfig } from './config';
import { GameRepository } from './repository';
import { createApi } from './server';

const config = readConfig();
const client = new MongoClient(config.uri, { serverSelectionTimeoutMS: 5000 });
try {
    await client.connect();
    const db = client.db(config.database);
    const repository = new GameRepository(db.collection(config.collection));
    await repository.initialize();
    const server = createApi(repository, config.origins, () => db.command({ ping: 1 }));
    server.on('error', async () => {
        console.error('Middleware could not listen. Check MIDDLEWARE_PORT.');
        await client.close();
        process.exitCode = 1;
    });
    server.listen(config.port, '127.0.0.1', () =>
        console.log(`Middleware ready at http://127.0.0.1:${config.port}`),
    );
    const stop = () => {
        server.close(() => {
            client
                .close()
                .then(() => process.exit(0))
                .catch(() => process.exit(1));
        });
        server.closeIdleConnections();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    process.on('message', (message) => {
        if (message === 'shutdown') {
            stop();
        }
    });
} catch {
    console.error(
        'Middleware startup failed. Check MongoDB availability, .env, and duplicate game names in the configured collection.',
    );
    await client.close();
    process.exitCode = 1;
}
