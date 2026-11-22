import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CharacterDefinition, CharacterRules, CharacterCollection } from '@lib/types/character.type';
import type { CharacterProgressionProfile, ProgressionTrackDefinition } from '@lib/types/character-extension.type';
import { emptyCharacterCollection, emptyCharacterDefinition, validCharacterCollection, validCharacterDefinition, validCharacterRules, characterCollectionFits, characterDefinitionFits } from '@common/characters/characters';
import { validProgressionProfiles, validCharacterResources } from '@common/characters/character-extension';
import { characterProgressIssues, characterTrackProgress } from '@common/characters/character-progression';
import { characterCatalogRecord } from '@common/characters/character-catalog';
import type { CatalogEntry } from '@lib/types/workspace.type';
import { validCatalog } from '@common/workspace/workspace';
import { ProgressService } from '../progress/progress.service';
import type { CatalogRepository, AccountProgressRepository } from '../../app/app.types';

// Deliberately synthetic limits: these are architecture fixtures, not verified game presets.
const track = (id: string, maxValue: number, type: ProgressionTrackDefinition['type'] = 'skill'): ProgressionTrackDefinition => ({ id, label: id, type, minValue: 0, maxValue, displayOrder: 0 });
const baseRules: CharacterRules = { levelCap: 100, rarities: [5], weaponTypes: [], damageTypes: [], roles: [], equipmentSlots: [], progressionTracks: [] };
const profileRules = (gameId: string, tracks: ProgressionTrackDefinition[]): CharacterRules => ({ ...baseRules, progressionProfiles: [{ id: 'standard', gameId, tracks }] });
const definition = (extra: Partial<CharacterDefinition> = {}): CharacterDefinition => ({ ...emptyCharacterDefinition(), schemaVersion: 2, progressionProfileId: 'standard', ...extra });
const character: CatalogEntry = { id: 'character', game: 'genshin', kind: 'characters', name: 'Test character', notes: '', rarity: 5, category: '', order: 0, day: '', members: [], requirements: [] };

await test('Genshin-shaped progression uses existing level/ascension/skill state and independent constellation goals', () => {
    const rules = { ...profileRules('genshin', [track('level', 100, 'level'), track('ascension', 2, 'ascension'), { ...track('talent', 8), storage: { field: 'skillLevels' as const, key: 'talent' } }, track('constellation', 4, 'enhancement')]),
        ascensionRanks: [{ levelCap: 20, skillLevelCap: 1 }, { levelCap: 50, skillLevelCap: 4 }, { levelCap: 100, skillLevelCap: 8 }] };
    const data = definition({ skills: [{ id: 'talent', name: 'Talent', description: '', maxLevel: 8 }] });
    const current = { ...emptyCharacterCollection(), level: 50, ascensionRank: 1, skillLevels: { talent: 4 }, trackValues: { constellation: 1 }, target: { level: 100, ascensionRank: 2, skillLevels: { talent: 8 }, gear: {}, progression: {}, trackValues: { constellation: 3 } } };
    assert.equal(validCharacterRules(rules), true); assert.equal(characterDefinitionFits(data, 5, rules), true);
    assert.equal(validCharacterCollection(current), true); assert.equal(characterCollectionFits(current, rules, data), true);
    assert.equal(characterCollectionFits({ ...current, level: 51 }, rules, data), false);
    assert.equal(characterCollectionFits({ ...current, trackValues: { ...current.trackValues, level: 50 } }, rules, data), false);
    assert.equal(characterCollectionFits({ ...current, target: { ...current.target, trackValues: { constellation: 0 } } }, rules, data), false);
    assert.equal(characterTrackProgress(current, rules, data).find(item => item.track.id === 'level')?.current, 50);
    assert.equal(characterTrackProgress(current, rules, data).find(item => item.track.id === 'constellation')?.remaining, 2);
});
await test('HSR-shaped branching trace unlocks validate dependencies and retain optional target nodes', () => {
    const tracks: ProgressionTrackDefinition[] = [track('level', 100, 'level'), { id: 'root', label: 'Root trace', type: 'unlock', displayOrder: 1, dependencies: [{ trackId: 'level', requiredValue: 20 }] },
        { id: 'branch', label: 'Branch trace', type: 'unlock', displayOrder: 2, dependencies: [{ trackId: 'root', requiredValue: 1 }] }];
    const rules = profileRules('hsr', tracks), data = definition();
    const current = { ...emptyCharacterCollection(), level: 20, nodeStates: { root: { unlocked: true }, branch: { unlocked: false } }, target: { level: 30, gear: {}, progression: {}, nodeStates: { branch: { unlocked: true } } } };
    assert.equal(validCharacterRules(rules), true); assert.equal(characterCollectionFits(current, rules, data), true);
    assert.equal(characterCollectionFits({ ...current, nodeStates: { root: { unlocked: false }, branch: { unlocked: true } } }, rules, data), false);
    assert.equal(characterCollectionFits({ ...current, level: 19 }, rules, data), false);
    assert.equal(characterCollectionFits({ ...current, trackValues: { root: 1 } }, rules, data), false);
    assert.equal(characterTrackProgress(current, rules, data).find(item => item.track.id === 'branch')?.target, 1);
    const corrupt = structuredClone(tracks); corrupt[1].dependencies = [{ trackId: 'branch', requiredValue: 1 }];
    assert.equal(validProgressionProfiles([{ id: 'standard', gameId: 'hsr', tracks: corrupt }]), false);
});
await test('FGO-shaped enhancement accepts discrete ranks, high invested values, and character exceptions without changing shared rules', () => {
    const rules = profileRules('fgo', [track('level', 100, 'level'), track('np', 4, 'enhancement'), { ...track('grail', 8, 'enhancement'), levels: [0, 2, 4, 8] }, track('fou', 5000, 'enhancement'), track('bond', 20, 'custom')]);
    const data = definition({ progressionOverrides: [{ ...track('np', 8, 'enhancement'), upgradeCosts: [{ fromValue: 0, toValue: 1, materials: [{ itemId: 'material', quantity: 2 }] }] }] });
    const current = { ...emptyCharacterCollection(), owned: false, level: 1, trackValues: { np: 7, fou: 4000, grail: 2 }, target: { level: 100, gear: {}, progression: {}, trackValues: { np: 8, grail: 4 } } };
    assert.equal(validCharacterDefinition(data), true); assert.equal(characterDefinitionFits(data, 5, rules), true); assert.equal(characterCollectionFits(current, rules, data), true);
    assert.equal(characterCollectionFits({ ...current, trackValues: { grail: 3 } }, rules, data), false);
    assert.equal(characterCollectionFits(current, rules, definition()), false);
    assert.equal(rules.progressionProfiles![0].tracks.find(item => item.id === 'np')?.maxValue, 4);
    assert.equal(validCharacterDefinition(definition({ progressionOverrides: [{ ...track('np', 8), upgradeCosts: [{ fromValue: 1, toValue: 2, materials: [{ itemId: 'material', quantity: -1 }] }] }] })), false);
});
await test('attribute registries, independent abilities and resources validate while unknown safe attributes survive', () => {
    const rules = { ...profileRules('genshin', [track('skill', 5)]), attributes: [{ id: 'element', label: 'Element', type: 'enum' as const, options: ['Fire', 'Ice'], displayOrder: 0, filterable: true, visibleInHeader: true }] };
    const data = definition({ attributes: { element: 'Ice', future: 'Unknown metadata' }, abilities: [{ id: 'ability', name: 'Ability', category: 'active', progressionTrackId: 'skill' }, { id: 'passive', name: 'Fixed passive', category: 'passive' }], resources: [{ id: 'lore', title: 'Story', category: 'official-lore', sourceType: 'internal', contentId: 'story' }] });
    assert.equal(validCharacterDefinition(data), true); assert.equal(characterDefinitionFits(data, 5, rules), true);
    assert.equal(characterDefinitionFits({ ...data, attributes: { element: 'Unknown' } }, 5, rules), false);
    assert.equal(characterDefinitionFits({ ...data, progressionProfileId: 'missing' }, 5, rules), false);
    assert.equal(characterDefinitionFits({ ...data, abilities: [{ id: 'a', name: 'A', category: 'skill', progressionTrackId: 'missing' }] }, 5, rules), false);
    assert.equal(validCharacterDefinition({ ...data, owned: true }), false);
    assert.equal(validCharacterResources([{ id: 'bad', category: 'other', title: 'Bad', sourceType: 'external', url: 'data:text/html,unsafe' }]), false);
    assert.equal(validCharacterResources([{ id: 'bad', category: 'other', title: 'Bad', sourceType: 'external', url: 'https://name:password@example.com' }]), false);
    const shared = { ...character, characterDefinition: data }, story = { ...character, characterDefinition: globalThis.undefined, id: 'story', kind: 'story' as const };
    assert.equal(validCatalog([shared, story], 'genshin'), true); assert.equal(validCatalog([shared], 'genshin'), false);
    const projected = characterCatalogRecord(shared, [shared, { ...story, characterId: shared.id }]);
    assert.equal(projected.resources.filter(resource => resource.contentId === 'story').length, 1);
    assert.equal('characterCollection' in projected, false);
});
await test('profile updates preserve unchanged obsolete values but reject new invalid values and broken dependents', () => {
    const rules = profileRules('hsr', [track('skill', 4), { id: 'node', label: 'Node', type: 'unlock', displayOrder: 1, dependencies: [{ trackId: 'skill', requiredValue: 4 }] }]);
    const data = definition(), old: CharacterCollection = { ...emptyCharacterCollection(), trackValues: { skill: 6, retired: 8 }, nodeStates: { node: { unlocked: true } } };
    assert.ok(characterProgressIssues(old, rules, data).length);
    assert.equal(characterProgressIssues({ ...old, notes: 'Preserved', favorite: true }, rules, data, old).length, 0);
    assert.ok(characterProgressIssues({ ...old, trackValues: { ...old.trackValues, skill: 7 } }, rules, data, old).length);
    assert.ok(characterProgressIssues({ ...old, trackValues: { skill: 3 } }, rules, data, old).some(issue => issue.trackId === 'node'));
    assert.deepEqual(old.trackValues, { skill: 6, retired: 8 });
    assert.equal(validCharacterCollection({ ...old, favorite: true }), true);
    assert.equal(validCharacterCollection({ ...old, trackValues: { skill: -1 } }), false);
    assert.equal(validCharacterCollection({ ...old, nodeStates: { node: { unlocked: true, injected: true } } }), false);
});
await test('all configured game IDs can use the same progression contract without game-specific validators', () => {
    for (const game of ['endfield', 'fgo', 'genshin', 'gf2', 'hsr', 'wuwa', 'zzz', 'nte']) {
        const rules = profileRules(game, [track('level', 100, 'level'), track('custom-upgrade', 8, 'custom')]);
        assert.equal(validCharacterRules(rules), true); assert.equal(characterCollectionFits({ ...emptyCharacterCollection(), trackValues: { 'custom-upgrade': 3 } }, rules, definition()), true);
    }
});
await test('inventory media, aliases and rarity labels validate without accepting unsafe sources or unknown rarity keys', () => {
    const data = definition({ headshot: '/api/games/genshin/images/avatar.webp', alternateNames: ['Alternative name'] });
    assert.equal(validCharacterDefinition(data), true);
    assert.equal(validCharacterDefinition({ ...data, headshot: 'data:image/svg+xml,unsafe' }), false);
    assert.equal(validCharacterDefinition({ ...data, alternateNames: [42] }), false);
    assert.equal(validCharacterRules({ ...baseRules, rarityLabels: { '5': 'SSR' } }), true);
    assert.equal(validCharacterRules({ ...baseRules, rarityLabels: { '4': 'Not configured' } }), false);
    assert.equal(validCharacterRules({ ...baseRules, rarityLabels: { '5': '' } }), false);
    assert.deepEqual(characterCatalogRecord({ ...character, characterDefinition: data }, []).media, { headshot: data.headshot });
    const withBanner = { ...data, banner: '/api/games/genshin/images/banner.webp' };
    assert.equal(validCharacterDefinition(withBanner), true);
    assert.equal(validCharacterDefinition({ ...data, banner: 'file:///local/banner.webp' }), false);
    assert.equal(validCharacterDefinition({ ...data, banner: 'data:image/svg+xml,unsafe' }), false);
    assert.deepEqual(characterCatalogRecord({ ...character, characterDefinition: withBanner }, []).media, { headshot: data.headshot, banner: withBanner.banner });
});
await test('account API validation enforces profile constraints for owned and unowned plans without catalog writes', async () => {
    const rules = profileRules('genshin', [track('skill', 8), { id: 'node', label: 'Node', type: 'unlock', displayOrder: 1, dependencies: [{ trackId: 'skill', requiredValue: 4 }] }]);
    const catalog: CatalogRepository = { async read() {return { id: 'genshin', name: 'Game', revision: 0, entries: [{ ...character, characterDefinition: definition() }], characterRules: rules };}, async parsed() {return {};}, async write() {throw new Error('Progress cannot write a catalog');} };
    let state = {};
    const progress: AccountProgressRepository = { async read(user) {assert.equal(user, 'alice'); return { revision: 0, state };}, async patch(user, revision, changes) {assert.equal(user, 'alice'); state = { ...state, ...changes }; return { revision: revision + 1, state };} };
    const service = new ProgressService(catalog, progress);
    const patch = (collection: CharacterCollection) => service.patch('alice', { revision: 0, changes: { 'genshin/character': { completed: false, quantity: 0, target: 0, characterCollection: collection } } });
    await assert.rejects(patch({ ...emptyCharacterCollection(), owned: false, nodeStates: { node: { unlocked: true } } }), { status: 400 });
    const valid = { ...emptyCharacterCollection(), owned: false, favorite: true, trackValues: { skill: 4 }, nodeStates: { node: { unlocked: true } } };
    await patch(valid); assert.deepEqual((state as Record<string, { characterCollection: CharacterCollection }>)['genshin/character'].characterCollection, valid);
});
