import { Document } from 'mongodb';
import { createHash } from 'node:crypto';
import { CATALOG_FIELDS, CatalogEntry, Kind, validCatalog } from '../../common/workspace';
import { decodeStory, encodeStory, mergeStory } from './story-document';

export const GAME_ARRAYS = [
    'achievements',
    'characters',
    'events',
    'inventory',
    'plans',
    'story',
    'teams',
] as const;
const OTHER_ARRAYS = GAME_ARRAYS.filter((field) => field !== 'achievements' && field !== 'story');

function achievement(entry: CatalogEntry): Document {
    return {
        _id: entry.id,
        title: entry.name,
        order: entry.order,
        icon: entry.icon ?? '',
        reward: entry.reward ?? '',
        rewardIcon: entry.rewardIcon ?? '',
        description: entry.description ?? '',
        url: entry.wikiUrl ?? '',
        // Older backups may contain notes as well as a description. Preserve both.
        ...(entry.notes ? { notes: entry.notes } : {}),
    };
}

/** The HTTP adapter remains flat so browser progress keys and existing backups stay compatible. */
export function encodeEntries(entries: CatalogEntry[]): Document {
    const result: Document = {};
    result['story'] = encodeStory(entries);
    for (const field of OTHER_ARRAYS) {
        result[field] = entries.filter((entry) => entry.kind === field);
    }
    result['achievements'] = entries
        .filter((entry) => entry.kind === 'achievement-category')
        .map((category) => ({
            ...achievement(category),
            achievements: entries
                .filter((entry) => entry.kind === 'achievements' && entry.category === category.id)
                .map((entry) => ({
                    ...achievement(entry),
                    requirements: entry.requirementText ?? '',
                })),
        }));
    return result;
}

function decodeAchievement(value: Document, game: string, kind: Kind, category = ''): CatalogEntry {
    return {
        id: String(value['_id']),
        game,
        kind,
        name: value['title'],
        order: Number(value['order'] ?? 0),
        icon: value['icon'] ?? '',
        reward: value['reward'] ?? '',
        rewardIcon: value['rewardIcon'] ?? '',
        description: value['description'] ?? '',
        wikiUrl: value['url'] ?? '',
        notes: value['notes'] ?? '',
        category,
        rarity: 1,
        members: [],
        requirements: [],
        day: '',
        ...(kind === 'achievements' ? { requirementText: value['requirements'] ?? '' } : {}),
    };
}

const eventDate = (value: unknown): string =>
    value instanceof Date
        ? Number.isFinite(value.getTime())
            ? value.toISOString()
            : ''
        : typeof value === 'string'
          ? value
          : '';
/** Parser records stay authoritative. The identity includes the period so renewed tasks start fresh. */
function parsedEvent(value: Document, game: string, order: number): CatalogEntry {
    const startDate = eventDate(value['startDate']);
    const endDate = eventDate(value['endDate']);
    const identity = JSON.stringify([
        game,
        String(value['_id'] ?? ''),
        value['title'],
        value['url'],
        value['eventType'],
        startDate,
        endDate,
    ]);
    return {
        id: 'parsed-event-' + createHash('sha256').update(identity).digest('hex').slice(0, 32),
        game,
        kind: 'events',
        name: value['title'],
        notes: '',
        category: value['eventType'] ?? '',
        eventType: value['eventType'] ?? '',
        startDate,
        endDate,
        wikiUrl: typeof value['url'] === 'string' ? value['url'] : '',
        icon: typeof value['icon'] === 'string' ? value['icon'] : '',
        order,
        rarity: 1,
        members: [],
        requirements: [],
        day: '',
    };
}

function parserEvents(document: Document): Document[] {
    return (document['events'] ?? []).filter(
        (entry: Document) =>
            entry['kind'] !== 'events' &&
            typeof entry['title'] === 'string' &&
            entry['title'].trim(),
    );
}

export function decodeEntries(document: Document, game: string): CatalogEntry[] {
    const entries: CatalogEntry[] = OTHER_ARRAYS.flatMap((field) =>
        (document[field] ?? []).filter(
            (entry: Document) => entry['kind'] === field && typeof entry['id'] === 'string',
        ),
    );
    const ids = new Set(entries.map((entry) => entry.id));
    for (const [index, value] of parserEvents(document).entries()) {
        const entry = parsedEvent(value, game, index);
        if (!ids.has(entry.id)) {
            entries.push(entry);
            ids.add(entry.id);
        }
    }
    entries.push(...decodeStory(document['story'] ?? [], game));
    for (const category of document['achievements'] ?? []) {
        entries.push(decodeAchievement(category, game, 'achievement-category'));
        for (const entry of category.achievements ?? []) {
            entries.push(decodeAchievement(entry, game, 'achievements', String(category._id)));
        }
    }
    return entries;
}

/** Keep parser records in the same root arrays, without converting them to editable UI records. */
export function mergeEntries(document: Document, entries: CatalogEntry[]): Document {
    const arrays = encodeEntries(entries);
    arrays['story'] = mergeStory(document['story'] ?? [], entries);
    for (const field of OTHER_ARRAYS) {
        const parsedIds = new Set(
            field === 'events'
                ? parserEvents(document).map(
                      (entry, index) => parsedEvent(entry, entries[0]?.game ?? '', index).id,
                  )
                : [],
        );
        arrays[field] = [
            ...(document[field] ?? []).filter(
                (entry: Document) => !(entry['kind'] === field && typeof entry['id'] === 'string'),
            ),
            ...arrays[field].filter((entry: CatalogEntry) => !parsedIds.has(entry.id)),
        ];
    }
    return arrays;
}

export function migrateDocument(document: Document): Document {
    const catalog = document['catalog'];
    const arrays: Document = {};
    for (const field of GAME_ARRAYS) arrays[field] = document[field] ?? [];
    if (catalog) {
        const entries = Object.values(CATALOG_FIELDS).flatMap(
            (field) => catalog[field] ?? [],
        ) as CatalogEntry[];
        if (entries.length && !validCatalog(entries, entries[0].game)) {
            throw new Error(
                'Legacy catalog has invalid entries or references; original data was preserved.',
            );
        }
        const encoded = encodeEntries(entries);
        for (const field of GAME_ARRAYS) {
            // Root records predate the catalog and must not be overwritten by it.
            const existingIds = new Set(
                arrays[field].map((entry: Document) =>
                    String(entry['_id'] ?? entry['id'] ?? entry['category']?._id),
                ),
            );
            arrays[field] = [
                ...arrays[field],
                ...encoded[field].filter(
                    (entry: Document) =>
                        !existingIds.has(
                            String(entry['_id'] ?? entry['id'] ?? entry['category']?._id),
                        ),
                ),
            ];
        }
    }
    const legacyStory = arrays['story'].find((entry: Document) => entry['kind'] === 'story');
    if (legacyStory) {
        arrays['story'] = mergeStory(
            arrays['story'],
            decodeStory(arrays['story'], legacyStory.game),
        );
    }
    arrays['achievements'] = arrays['achievements'].map((category: Document) => ({
        ...category,
        order: integerOrder(category['order']),
        achievements: (category['achievements'] ?? []).map((entry: Document) => ({
            ...entry,
            order: integerOrder(entry['order']),
        })),
    }));
    // Parser completion flags were defaults, not per-player progress.
    arrays['events'] = arrays['events'].map(
        ({ completed, quantity, target, ...event }: Document) => event,
    );
    return {
        ...arrays,
        version: { title: '', releaseDate: '', url: '', ...document['version'] },
        _schemaVersion: 2,
        _revision: Number(catalog?.revision ?? document['_revision'] ?? 0),
    };
}

function integerOrder(value: unknown): number {
    const order = Number(value ?? 0);
    if (!Number.isSafeInteger(order)) {
        throw new Error('Achievement order must be an integer; original data was preserved.');
    }
    return order;
}
