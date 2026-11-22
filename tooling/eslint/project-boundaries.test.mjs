import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { boundaryViolation } from './project-boundaries.mjs';

test('architectural boundaries cover aliases, relative imports and allowed dependencies', () => {
    const file = path => resolve('projects', path);
    assert.ok(boundaryViolation(file('lib/types/example.ts'), '@common/quests/story-template'));
    assert.ok(boundaryViolation(file('lib/types/example.ts'), '../../common/quests/story-template'));
    assert.ok(boundaryViolation(file('common/quests/example.ts'), '@core/auth/auth.store'));
    assert.ok(boundaryViolation(file('guides-app/src/app/example.ts'), '../../../middleware/src/app/app'));
    assert.ok(boundaryViolation(file('middleware/src/app/example.ts'), '../../../guides-app/src/main'));
    assert.equal(boundaryViolation(file('common/quests/example.ts'), '@lib/types/workspace.type'), null);
    assert.equal(boundaryViolation(file('guides-app/src/app/example.ts'), '@common/quests/story-template'), null);
    assert.equal(boundaryViolation(file('lib/types/example.ts'), 'mongodb'), null);
    assert.ok(boundaryViolation(file('data-parser/src/sync/example.ts'), '../legacy/parsers/genshin-impact'));
    assert.equal(boundaryViolation(file('data-parser/src/sync/example.spec.ts'), '../legacy/parsers/genshin-impact'), null);
});
