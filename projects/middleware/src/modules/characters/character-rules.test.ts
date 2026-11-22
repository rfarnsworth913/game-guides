import {test} from 'node:test';
import assert from 'node:assert/strict';
import {characterRulesCompatibility} from '@common/characters/character-rules';
import {validCharacterRules, emptyCharacterDefinition, characterDefinitionFits} from '@common/characters/characters';
import {characterProfileTracks} from '@common/characters/character-progression';
import type {CharacterRules} from '@lib/types/character.type';

const rules: CharacterRules = {levelCap: 100, rarities: [5], weaponTypes: [], damageTypes: [], roles: [], equipmentSlots: [], progressionTracks: [],
    configurationVersion: 1, description: 'Synthetic test configuration', attributes: [{id:'element', label:'Element', type:'enum', options:['A','B'], displayOrder:0, filterable:true, visibleInHeader:true}],
    progressionProfiles: [{id:'standard', gameId:'genshin', tracks:[{id:'level', label:'Level', type:'level', minValue:1, maxValue:100, displayOrder:0}]}]};
await test('rules metadata, boolean attributes, defaults and required values validate together', () => {
    const configured = {...rules, defaultProgressionProfileId: 'standard', attributes: [{id:'playable', label:'Playable', type:'boolean' as const, required:true, searchable:false, visibleInDetails:true, displayOrder:0, filterable:true, visibleInHeader:true}]};
    assert.equal(validCharacterRules(configured), true);
    assert.equal(characterDefinitionFits({...emptyCharacterDefinition(), attributes:{playable:false}}, 5, configured), true);
    assert.equal(characterDefinitionFits(emptyCharacterDefinition(), 5, configured), false);
    assert.equal(characterProfileTracks(configured, emptyCharacterDefinition())[0].id, 'level');
    assert.equal(validCharacterRules({...configured, defaultProgressionProfileId:'missing'}), false);
    assert.equal(validCharacterRules({...configured, configurationVersion:0}), false);
    for (const version of ['1.6', '1.10', '1.6.1', 2]) {
        assert.equal(validCharacterRules({...configured, configurationVersion:version}), true);
    }
    for (const version of ['', '   ', '1'.repeat(65), 1.6]) {
        assert.equal(validCharacterRules({...configured, configurationVersion:version}), false);
    }
});
await test('safe labels and ordering remain editable while destructive changes require migration', () => {
    const renamed = structuredClone(rules); renamed.attributes![0].label = 'Damage type'; renamed.progressionProfiles![0].tracks[0].label = 'Character level';
    assert.deepEqual(characterRulesCompatibility(rules, renamed), []);
    const changes: ((rules: CharacterRules) => void)[] = [next => {next.attributes![0].options!.pop();}, next => {next.progressionProfiles!.pop();}, next => {next.progressionProfiles![0].tracks[0].maxValue = 50;}, next => {next.progressionProfiles![0].tracks[0].type = 'custom';}, next => {next.levelCap = 50;}];
    for (const change of changes) {const next = structuredClone(rules); change(next); assert.ok(characterRulesCompatibility(rules, next).length);}
    assert.deepEqual(rules.attributes![0].options, ['A','B']); assert.equal(rules.progressionProfiles![0].tracks[0].maxValue, 100);
});
