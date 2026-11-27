import type { LegacyCatalogEntry } from '@lib/types/workspace.type';
import type { CharacterResource, CharacterCatalogRecord } from '@lib/types/character-extension.type';
import type { CharacterRules } from '@lib/types/character.type';

/** Public read projection. Existing entry IDs and shared storage remain authoritative. */
export function characterCatalogRecord(entry: LegacyCatalogEntry, entries: LegacyCatalogEntry[], rules?: CharacterRules): CharacterCatalogRecord {
    const definition = entry.characterDefinition, story = entry.characterInformation;
    const resources: CharacterResource[] = structuredClone(definition?.resources ?? []);
    for (const [index, guide] of (definition?.guides ?? []).entries()) {
        if (!resources.some(resource => resource.url === guide.url)) {resources.push({ id: `legacy-guide-${index}`, category: 'build-guides', title: guide.title, sourceType: 'external', url: guide.url });}
    }
    for (const placement of entries.filter(item => item.kind === 'story' && item.characterId === entry.id && item.game === entry.game)) {
        if (!resources.some(resource => resource.contentId === placement.id)) {resources.push({ id: `story-${placement.id}`, category: 'official-lore', title: placement.name, sourceType: 'internal', contentId: placement.id });}
    }
    return {
        id: entry.id, gameId: entry.game,
        identity: { name: entry.name, description: entry.notes, ...(definition?.alternateNames ? { alternateNames: definition.alternateNames } : {}), ...(story?.patchVersion ? { releaseVersion: story.patchVersion } : {}) },
        classification: { rarity: entry.rarity, attributes: { weaponType: definition?.weaponType ?? '', damageType: definition?.damageType ?? story?.damageType ?? '', roles: definition?.roles ?? [], ...definition?.attributes } },
        media: { ...(entry.icon ? { icon: entry.icon } : {}), ...(definition?.headshot ? { headshot: definition.headshot } : {}), ...(definition?.banner ? { banner: definition.banner } : {}), ...(story?.imageUrl ? { fullArtwork: story.imageUrl } : {}) },
        abilities: definition?.abilities ?? [...(definition?.skills ?? []).map((skill, index) => ({ id: skill.id ?? `skill-${index}`, name: skill.name, description: skill.description, category: 'active' })),
            ...(definition?.passiveSkills ?? []).map((skill, index) => ({ id: skill.id ?? `passive-${index}`, name: skill.name, description: skill.description, category: 'passive' }))],
        resources: resources.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id)),
        progressionProfileId: definition?.progressionProfileId ?? rules?.defaultProgressionProfileId ?? null,
        ...(definition?.progressionOverrides ? { progressionOverrides: definition.progressionOverrides } : {}),
        metadata: { schemaVersion: 2 as const, sourceSchemaVersion: definition?.schemaVersion ?? 1, ...(story?.sourceUrl ? { sourceUrls: [story.sourceUrl] } : {}) },
    };
}
