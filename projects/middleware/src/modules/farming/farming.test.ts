import { test } from 'node:test';
import assert from 'node:assert/strict';
import { characterCosts, farmingGroups, farmingRequirements, hasCharacterGoal, serverDay, sourceAvailability } from "../../../../common/farming/farming";
import type { FarmingConfig, UpgradeRecipe } from "../../../../lib/types/farming-config.type";
import { validFarmingConfig, validRecipes } from "../../../../common/farming/farming-config";
import { emptyCharacterCollection, emptyCharacterDefinition, validCharacterDefinition, validCharacterRules } from "../../../../common/characters/characters";
import type { Entry } from "../../../../lib/types/workspace.type";
import { toCatalog, validCatalog } from "../../../../common/workspace/workspace";
import { decodeEntries, encodeEntries } from "../documents/game-document";
import { GameRepository } from "../games/games.repository";
import { Collection, Document } from 'mongodb';

const item: Entry = {
    id: 'book',
    game: 'genshin',
    kind: 'inventory',
    name: 'Book',
    category: 'Talent',
    notes: '',
    day: '',
    rarity: 3,
    members: [],
    requirements: [],
    completed: false,
    quantity: 4,
    target: 0,
    order: 0,
};
const recipes: UpgradeRecipe[] = [
    { kind: 'level', from: 1, to: 2, materials: [{ item: 'book', amount: 100 }] },
    { kind: 'level', from: 2, to: 3, materials: [{ item: 'book', amount: 3 }] },
    { kind: 'level', from: 3, to: 4, materials: [{ item: 'book', amount: 5 }] },
];
const character: Entry = {
    ...item,
    id: 'character',
    kind: 'characters',
    name: 'Character',
    quantity: 0,
    characterDefinition: { ...emptyCharacterDefinition(), recipes },
    characterCollection: {
        ...emptyCharacterCollection(),
        level: 2,
        target: { level: 4, gear: {}, progression: {} },
    },
};
const config: FarmingConfig = {
    sources: [
        {
            id: 'domain',
            name: 'Domain',
            category: 'Domain',
            region: 'Region',
            location: 'Verified location',
            materialIds: ['book'],
            days: [1, 4],
            url: 'https://example.com/domain',
            restrictions: '',
        },
        {
            id: 'shop',
            name: 'Shop',
            category: 'Shop',
            region: 'Region',
            location: '',
            materialIds: ['book'],
            days: [0, 1, 2, 3, 4, 5, 6],
            url: '',
            restrictions: 'Limited stock',
        },
    ],
    servers: [
        { id: 'asia', name: 'Asia', timeZone: 'Asia/Shanghai', resetHour: 4, resetMinute: 0 },
    ],
};

await test('character recipes sum unconsumed level, ascension, skill and additional progression transitions', () => {
    const collection = {
        ...character.characterCollection!,
        ascensionRank: 0,
        skillLevels: { skill: 2 },
        progression: { rank: 3 },
        target: {
            ...character.characterCollection!.target!,
            ascensionRank: 1,
            skillLevels: { skill: 3 },
            progression: { rank: 4 },
        },
    };
    const definition = {
        ...character.characterDefinition!,
        skills: [{ id: 'skill', name: 'Skill', description: '', maxLevel: 10 }],
        recipes: [
            ...recipes,
            {
                kind: 'ascension' as const,
                from: 0,
                to: 1,
                materials: [{ item: 'book', amount: 2 }],
            },
            {
                kind: 'skill' as const,
                key: 'skill',
                from: 2,
                to: 3,
                materials: [{ item: 'book', amount: 6 }],
            },
            {
                kind: 'progression' as const,
                key: 'rank',
                from: 3,
                to: 4,
                materials: [{ item: 'book', amount: 4 }],
            },
        ],
    };
    assert.equal(characterCosts(definition, collection).costs.get('book'), 20);
    assert.deepEqual(characterCosts(definition, collection).issues, []);
    assert.equal(hasCharacterGoal(collection), true);
    assert.equal(
        hasCharacterGoal({
            ...collection,
            target: {
                level: collection.level,
                ascensionRank: collection.ascensionRank,
                gear: collection.gear,
                skillLevels: collection.skillLevels,
                progression: collection.progression,
            },
        }),
        false,
    );
});
await test('selected characters aggregate before subtracting shared inventory and alternative sources do not duplicate stock', () => {
    const entries = [item, character, { ...character, id: 'other' }];
    const result = farmingRequirements(entries, 'genshin', ['character', 'other'], 'characters');
    assert.equal(result.materials[0].required, 16);
    assert.equal(result.materials[0].owned, 4);
    assert.equal(result.materials[0].missing, 12);
    const groups = farmingGroups(result.materials, config);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].materials[0], groups[1].materials[0]);
    assert.equal(
        farmingRequirements(entries, 'genshin', ['character'], 'characters').materials[0].required,
        8,
    );
    assert.equal(
        farmingRequirements(entries, 'hsr', ['character'], 'characters').materials.length,
        0,
    );
    assert.equal(farmingGroups(result.materials)[0].source, null);
});
await test('unknown and free recipes remain distinct and saved shared material plans count once', () => {
    const partial = characterCosts(
        { ...character.characterDefinition!, recipes: recipes.slice(1, 2) },
        character.characterCollection,
    );
    assert.equal(partial.costs.get('book'), 3);
    assert.equal(partial.issues.length, 1);
    const free = characterCosts(
        {
            ...character.characterDefinition!,
            recipes: [{ kind: 'level', from: 2, to: 3, materials: [] }],
        },
        { ...character.characterCollection!, target: { level: 3, gear: {}, progression: {} } },
    );
    assert.equal(free.costs.size, 0);
    assert.equal(free.issues.length, 0);
    assert.equal(
        characterCosts(character.characterDefinition, {
            ...character.characterCollection!,
            target: { level: 1, gear: {}, progression: {} },
        }).issues.length,
        1,
    );
    const plan: Entry = {
        ...item,
        id: 'plan',
        kind: 'plans',
        members: ['character', 'other'],
        requirements: [{ item: 'book', amount: 40 }],
    };
    assert.equal(
        farmingRequirements([item, plan], 'genshin', ['character', 'other'], 'plans').materials[0]
            .required,
        40,
    );
    assert.equal(
        farmingRequirements([item, { ...plan, members: [] }], 'genshin', [], 'plans', true)
            .materials[0].required,
        40,
    );
});
await test('schedule uses configured server reset boundaries, daylight saving, and explicit unknown availability', () => {
    assert.deepEqual(serverDay(Date.parse('2026-10-29T19:30:00Z'), config.servers[0]), {
        day: 4,
        date: '2026-10-29',
    });
    assert.deepEqual(serverDay(Date.parse('2026-10-29T20:00:00Z'), config.servers[0]), {
        day: 5,
        date: '2026-10-30',
    });
    const server = { ...config.servers[0], timeZone: 'America/New_York' };
    assert.equal(serverDay(Date.parse('2026-03-08T07:30:00Z'), server).day, 6);
    assert.equal(serverDay(Date.parse('2026-03-08T08:00:00Z'), server).day, 0);
    assert.equal(sourceAvailability(config.sources[0], Date.now()), 'unknown');
    assert.equal(sourceAvailability(config.sources[1], Date.now()), 'available');
    const unknownSource = { ...config.sources[0] };
    delete unknownSource.days;
    assert.equal(
        sourceAvailability(unknownSource, Date.now(), server),
        'unknown',
    );
});
await test('farming data validates links, times, unique transitions and catalog material references', () => {
    assert.equal(validFarmingConfig(config), true);
    assert.equal(validRecipes(recipes), true);
    assert.equal(validRecipes([...recipes, recipes[0]]), false);
    assert.equal(validRecipes([{ ...recipes[0], to: 3 }]), false);
    assert.equal(
        validFarmingConfig({
            ...config,
            servers: [{ ...config.servers[0], timeZone: 'Invalid/Timezone' }],
        }),
        false,
    );
    assert.equal(
        validFarmingConfig({
            ...config,
            sources: [{ ...config.sources[0], url: 'data:text/html,invalid' }],
        }),
        false,
    );
    assert.equal(validCharacterDefinition(character.characterDefinition), true);
    const catalog = [toCatalog(item), toCatalog(character)];
    assert.equal(validCatalog(catalog, 'genshin'), true);
    assert.equal(validCatalog([toCatalog(character)], 'genshin'), false);
    assert.deepEqual(
        decodeEntries(encodeEntries(catalog), 'genshin').find((entry) => entry.id === character.id)
            ?.characterDefinition?.recipes,
        recipes,
    );
    assert.equal(
        validCharacterRules({
            levelCap: 90,
            rarities: [3],
            weaponTypes: [],
            damageTypes: [],
            roles: [],
            equipmentSlots: [],
            progressionTracks: [],
            farming: config,
        }),
        true,
    );
});

await test('farming definitions persist through the existing catalog API boundary and reject orphaned sources', async () => {
    const catalog = [toCatalog(item), toCatalog(character)];
    const rules = {
        levelCap: 90,
        rarities: [3],
        weaponTypes: [],
        damageTypes: [],
        roles: [],
        equipmentSlots: [],
        progressionTracks: [],
        farming: config,
    };
    let document: Document = {
        _id: 'game',
        name: 'Genshin Impact',
        _revision: 0,
        ...encodeEntries(catalog),
        untouched: 'preserved',
    };
    const collection = {
        async findOne() {
            return structuredClone(document);
        },
        async updateOne(_filter: unknown, update: { $set: Document }) {
            document = { ...document, ...structuredClone(update.$set) };
            return { matchedCount: 1 };
        },
    } as unknown as Collection<Document>;
    const repository = new GameRepository(collection, collection);
    await repository.write('genshin', catalog, 0, rules);
    const saved = await repository.read('genshin');
    assert.deepEqual(saved.characterRules?.farming, config);
    assert.deepEqual(
        saved.entries.find((entry) => entry.id === character.id)?.characterDefinition?.recipes,
        recipes,
    );
    assert.equal(document['untouched'], 'preserved');
    await assert.rejects(
        repository.write('genshin', catalog, 1, {
            ...rules,
            farming: { ...config, sources: [{ ...config.sources[0], materialIds: ['missing'] }] },
        }),
        /Farming sources/,
    );
});
