import { Document } from 'mongodb';
import { CatalogEntry, fromCatalog, migrateStory, toCatalog } from '../../common/workspace';

export function normalizeStory(entries: CatalogEntry[]): CatalogEntry[] {
    return migrateStory(entries.map((entry) => fromCatalog(entry))).map(toCatalog);
}

/** A game owns an ordered array of { category: { title, order, icon, content } } sections. */
export function encodeStory(entries: CatalogEntry[]): Document[] {
    const normalized = normalizeStory(entries);
    return normalized
        .filter((entry) => entry.kind === 'story-category')
        .map((section) => ({
            category: {
                _id: section.id,
                title: section.name,
                order: section.order,
                icon: section.icon ?? '',
                content: {
                    subsections: normalized.filter(
                        (entry) => entry.kind === 'story' && entry.storySection === section.id,
                    ),
                },
            },
        }));
}

export function decodeStory(story: Document[], game: string): CatalogEntry[] {
    const entries: CatalogEntry[] = [];
    for (const record of story) {
        if (record['kind'] === 'story') {
            entries.push(record as CatalogEntry);
            continue;
        }
        const section = record['category'];
        if (!section || typeof section !== 'object') continue;
        entries.push({
            id: String(section._id),
            name: section.title,
            order: Number(section.order),
            icon: section.icon ?? '',
            game,
            kind: 'story-category',
            notes: '',
            category: '',
            rarity: 1,
            day: '',
            members: [],
            requirements: [],
        });
        for (const entry of section.content?.subsections ?? []) {
            entries.push({ ...entry, game, kind: 'story', storySection: String(section._id) });
        }
    }
    return normalizeStory(entries);
}

export function mergeStory(story: Document[], entries: CatalogEntry[]): Document[] {
    const sections = encodeStory(entries).map((record) => {
        const previous = story.find((old) => old['category']?._id === record['category']._id)?.[
            'category'
        ];
        return {
            category: {
                ...previous,
                ...record['category'],
                content: { ...previous?.content, ...record['category'].content },
            },
        };
    });
    return [
        ...story.filter((record) => !record['category'] && record['kind'] !== 'story'),
        ...sections,
    ];
}
