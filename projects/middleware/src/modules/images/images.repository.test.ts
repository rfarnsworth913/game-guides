import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { imageRoot } from './images.repository';

await test('moving image persistence retains the original upload directory', () => {
    assert.equal(resolve(imageRoot), resolve('projects/guides-app/src/assets'));
});
