import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogEntry } from '@lib/types/workspace.type';
import { emptyPatchOverview } from '@common/quests/story-template';
import { migrateStoryCharacters, resolveCharacterReferences, editCharacterStory } from '@common/characters/character-story';
import { validCatalog, fromCatalog, toCatalog } from '@common/workspace/workspace';
import { emptyCharacterDefinition } from '@common/characters/characters';
import { validateStoryProgress } from '../documents/stories/story-progress.service';
import { migrateCharacterDocument } from './character-story-migration';
import { encodeEntries } from '../documents/game-document';

const base: CatalogEntry = { id: 'section', game: 'genshin', kind: 'story-category', name: 'Region', notes: '', category: '', rarity: 1, members: [], requirements: [], order: 0, day: '' };
const story: CatalogEntry = { ...base, id: 'story-character', kind: 'story', storySection: 'section', category: 'character-information', name: 'Vesna', characterInformation: {
    ...emptyPatchOverview(), characterName: 'Vesna', damageType: 'Physical', summary: 'Shared description', sourceName: 'Official', sourceUrl: 'https://example.com',
    groups: [{ id: 'lore', title: 'Lore' }], rows: [{ id: 'old-row', groupId: 'lore', content: 'Profile', contentType: '', patch: '1.0', notes: 'Do not lose notes', contentUrl: 'https://example.com/profile' }],
} };

await test('story characters migrate once, preserving placements, links, row IDs and private completion keys', () => {
    const source = [base, story]; const before = structuredClone(source);
    const migrated = migrateStoryCharacters(source, () => 'canonical-character');
    assert.equal(migrated.created, 1); assert.equal(migrated.linked, 1);
    assert.equal(validCatalog(migrated.entries, 'genshin'), true);
    const placement = migrated.entries.find(entry => entry.id === story.id)!;
    assert.equal(placement.characterId, 'canonical-character'); assert.equal(placement.characterInformation, globalThis.undefined);
    assert.equal(placement.storySection, story.storySection); assert.equal(placement.order, story.order);
    assert.deepEqual(source, before);
    assert.deepEqual(migrateStoryCharacters(migrated.entries).entries, migrated.entries);
    const projected = resolveCharacterReferences(migrated.entries).find(entry => entry.id === story.id)!;
    assert.deepEqual(projected.characterInformation?.rows, story.characterInformation?.rows);
    assert.equal(projected.characterInformation?.summary, 'Shared description');
    const state = { completed: true, quantity: 0, target: 0, storyRowCompletion: { 'old-row': true } };
    assert.equal(fromCatalog(projected, state).completed, true);
    assert.doesNotThrow(() => validateStoryProgress(projected, state, {}));
    assert.throws(() => validateStoryProgress(projected, { ...state, storyRowCompletion: { forged: true } }, {}));
    assert.equal(toCatalog(fromCatalog(projected, state)).characterInformation, globalThis.undefined);
    assert.equal(validCatalog(migrated.entries.filter(entry => entry.id !== 'canonical-character'), 'genshin'), false);
    assert.equal(validCatalog(migrated.entries.map(entry => entry.id === 'canonical-character' ? { ...entry, game: 'hsr' } : entry), 'genshin'), false);
});

await test('matches an existing catalog character without changing its ID, skills, rarity, recipes or planner references', () => {
    const character = { ...base, id: 'existing-character', kind: 'characters' as const, name: '  VESNA  ', rarity: 5, notes: 'Existing description', characterDefinition: { ...emptyCharacterDefinition(), damageType: 'Physical', skills: [{ id: 'skill', name: 'Skill', description: 'Existing skill', maxLevel: 10 }] } };
    const plan = { ...base, id: 'plan', kind: 'plans' as const, members: ['existing-character'] };
    const result = migrateStoryCharacters([base, character, plan, story]);
    assert.equal(result.created, 0); assert.equal(result.linked, 1);
    const saved = result.entries.find(entry => entry.id === character.id)!;
    assert.deepEqual(saved.characterDefinition, character.characterDefinition); assert.equal(saved.rarity, 5);
    assert.equal(saved.notes, 'Existing description\n\nShared description');
    assert.deepEqual(result.entries.find(entry => entry.id === plan.id), plan);
    const projected = resolveCharacterReferences(result.entries);
    projected.find(entry => entry.id === story.id)!.characterInformation!.rows[0].notes = 'Unsaved draft';
    assert.equal(saved.characterInformation!.rows[0].notes, 'Do not lose notes');
    const edited = editCharacterStory(saved, { ...projected.find(entry => entry.id === story.id)!.characterInformation!, characterName: 'New name', damageType: 'Fire', summary: 'New description' });
    assert.equal(edited.name, 'New name'); assert.equal(edited.notes, 'New description'); assert.equal(edited.characterDefinition!.damageType, 'Fire');
    assert.equal(edited.characterInformation!.characterName, globalThis.undefined);
    assert.equal(edited.characterInformation!.damageType, globalThis.undefined);
});

await test('multiple placements share one character without losing distinct rows; ambiguity and conflicting IDs stop migration', () => {
    const second = structuredClone(story); second.id = 'second-placement'; second.characterInformation!.rows[0].id = 'other-row';
    const result = migrateStoryCharacters([base, story, second], () => 'canonical');
    assert.equal(result.created, 1); assert.equal(result.linked, 2);
    assert.deepEqual(result.entries.find(entry => entry.id === 'canonical')!.characterInformation!.rows.map(row => row.id), ['old-row', 'other-row']);
    second.characterInformation!.rows[0].id = 'old-row'; second.characterInformation!.rows[0].notes = 'Conflicting row';
    assert.throws(() => migrateStoryCharacters([base, story, second]), /conflicting rows ID/);
    assert.throws(() => migrateStoryCharacters([base, story, { ...base, kind: 'characters', id: 'one', name: 'Vesna' }, { ...base, kind: 'characters', id: 'two', name: 'vesna' }]), /multiple catalog matches/);
});

await test('document migration changes only character references and catalog records and is idempotent', () => {
    const arrays = encodeEntries([base, story]);
    const document = { ...arrays, name: 'Genshin Impact', _gameId: 'genshin', untouched: { parser: true }, _revision: 8 };
    const before = structuredClone(document);
    const fields = migrateCharacterDocument(document);
    assert.equal(fields.created, 1); assert.equal(fields.linked, 1);
    assert.deepEqual(document, before);
    const saved = { ...document, ...fields };
    assert.equal(migrateCharacterDocument(saved).linked, 0);
    assert.deepEqual(saved.events, document.events); assert.deepEqual(saved.untouched, document.untouched);
});
