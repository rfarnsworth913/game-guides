import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { DataService } from '../data-parser/src/services/data-service';

// Called only by the full-stack test with its randomly generated collection.
if (!/^middleware_test_[a-f0-9]{32}$/.test(process.env['DB_COLLECTION'] ?? '')) {
    throw new Error('Parser smoke test requires a disposable middleware test collection.');
}
const client = new MongoClient(process.env['DB_CONN_STRING']!);
const service = new DataService();
try {
    await client.connect();
    await service.connect();
    const collection = client.db(process.env['DB_NAME']).collection(process.env['DB_COLLECTION']!);
    const before = await collection.findOne({ name: 'Genshin Impact' });
    await service.addRecords('Genshin Impact', 'events', [
        { title: 'Parser smoke event', completed: false, quantity: 1, target: 5 },
        { title: 'Parser smoke event', completed: true, quantity: 2, target: 6 },
    ]);
    const appended = await collection.findOne({ name: 'Genshin Impact' });
    assert.deepEqual(appended!['events'].at(-1), { title: 'Parser smoke event' });
    assert.equal(appended!['events'].length, before!['events'].length + 1);
    assert.equal(appended!['_revision'], before!['_revision'] + 1);
    await service.cleanupExpiredItems('Genshin Impact', 'events', event => event.title !== 'Parser smoke event');
    const cleaned = await collection.findOne({ name: 'Genshin Impact' });
    assert.deepEqual(cleaned!['events'], before!['events']);
    assert.equal(cleaned!['_revision'], before!['_revision'] + 2);
} finally {
    await service.disconnect();
    await client.close();
}
