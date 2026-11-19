import {TestBed} from '@angular/core/testing';
import {CharacterCatalogFields} from './character-catalog-fields';
import {emptyCharacterDefinition,validCharacterDefinition} from '@common/characters/characters';
import type {CharacterRules} from '@lib/types/character.type';

describe('Shared character catalog fields',() => {
    it('edits configured attribute values, profile references and resource destinations without nested dialogs',() => {
        const definition = emptyCharacterDefinition();
        const fixture = TestBed.createComponent(CharacterCatalogFields);
        const rules:CharacterRules = {levelCap:80,rarities:[5],weaponTypes:[],damageTypes:[],roles:[],equipmentSlots:[],progressionTracks:[],attributes:[{id:'playable',label:'Playable',type:'boolean',displayOrder:0,filterable:true,visibleInHeader:false}]};
        fixture.componentRef.setInput('definition',definition);fixture.componentRef.setInput('game','endfield');fixture.componentRef.setInput('rules',rules);fixture.detectChanges();
        const editor = fixture.componentInstance;
        editor.setAttribute('playable',false);expect(definition.attributes?.['playable']).toBe(false);
        editor.setAttribute('roles-custom',['Support']);expect(definition.attributes?.['roles-custom']).toEqual(['Support']);
        editor.setProfile('profile');expect(definition.progressionProfileId).toBe('profile');editor.setProfile('');expect(definition.progressionProfileId).toBeUndefined();
        editor.addResource();const resource = definition.resources![0];resource.title = 'Build';resource.url = 'https://example.com/build';
        expect(validCharacterDefinition(definition)).toBe(true);
        editor.setSource(resource,'internal');resource.contentId = 'quest';expect(resource.url).toBeUndefined();expect(validCharacterDefinition(definition)).toBe(true);
        editor.setSource(resource,'external');expect(resource.contentId).toBeUndefined();resource.url = 'file:///private/build.txt';expect(validCharacterDefinition(definition)).toBe(false);
        editor.setAttribute('playable',null);expect(definition.attributes?.['playable']).toBeUndefined();
    });
});
