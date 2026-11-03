import type { StoredStory } from '../stored-document.types';
import type { CatalogEntry } from "../../../../../lib/types/workspace.type";
import { fromCatalog, migrateStory, toCatalog } from "../../../../../common/workspace/workspace";

export function normalizeStory(entries: CatalogEntry[]): CatalogEntry[] {
    return migrateStory(entries.map((entry) => fromCatalog(entry))).map(toCatalog);
}

/** A game owns an ordered array of { category: { title, order, icon, content } } sections. */
export function encodeStory(entries: CatalogEntry[]): StoredStory[] {
    const normalized = normalizeStory(entries);
    return normalized
        .filter((entry) => entry.kind === 'story-category')
        .map((section) => ({
            category: {
                _id: section.id,
                title: section.name,
                order: section.order,
                icon: section.icon ?? '',
                ...(section.sectionImageUrl !== globalThis.undefined ? { imageUrl: section.sectionImageUrl } : {}),
                content: {
                    subsections: normalized.filter(
                        (entry) => entry.kind === 'story' && entry.storySection === section.id,
                    ),
                },
            },
        }));
}

export function decodeStory(input: Array<Record<string, unknown>>, game: string): CatalogEntry[] {
    const story = input as StoredStory[];
    const entries: CatalogEntry[] = [];
    for (const record of story) {
        if (record['kind'] === 'story') {
            entries.push(record as unknown as CatalogEntry);
            continue;
        }
        const section = record['category'];
        if (!section || typeof section !== 'object') {continue;}
        entries.push({
            id: String(section._id),
            name: section.title,
            order: Number(section.order),
            icon: section.icon ?? '',
            ...(section.imageUrl !== globalThis.undefined ? { sectionImageUrl: section.imageUrl } : {}),
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

export function mergeStory(input: Array<Record<string, unknown>>, entries: CatalogEntry[]): StoredStory[] {
    const story = input as StoredStory[];
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
