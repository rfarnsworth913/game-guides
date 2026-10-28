import assert from 'node:assert/strict';
import { BSON, Document } from 'mongodb';
import { mainQuestRecords, reworkMainQuestTemplate } from '../../common/main-quest';
import { validPatchOverview } from '../../common/story-template';

/** Replaces only the requested quest payload; parser and unrelated fields are retained. */
export function reworkMainQuestDocument(document: Document, categories: readonly ('main-story' | 'side-stories')[] = ['main-story']) {
    let promoted = 0;
    let normalized = 0;
    let guides = 0;
    const review: { guide: string; group: string }[] = [];
    const rewrite = (entry: Document): Document => {
        if (!categories.includes(entry['category'])) return entry;
        const field = entry['category'] === 'side-stories' ? 'sideStories' : 'mainStory';
        if (!entry[field]) return entry;
        const source = entry[field];
        if (!validPatchOverview(source) || !source) throw new Error(`Invalid existing main quest template: ${entry['id']}`);
        const result = reworkMainQuestTemplate(source, entry['name']);
        if (!validPatchOverview(result.template)) throw new Error(`Invalid migrated main quest template: ${entry['id']}`);
        const before = mainQuestRecords(source);
        const after = mainQuestRecords(result.template);
        assert.equal(before.length, after.length, 'Migration must retain every parent and quest record');
        for (const original of before) {
            const saved = after.find(row => row.id === original.id);
            assert.ok(saved, 'Migration must retain every row ID');
            // Only the explicit indent flag and missing legacy group membership may change.
            const savedContent = { ...saved };
            const originalContent = { ...original };
            delete savedContent.subQuest; delete originalContent.subQuest;
            delete savedContent.groupId; delete originalContent.groupId;
            assert.deepEqual(savedContent, originalContent);
            assert.ok(!original.groupId || saved.groupId === original.groupId, 'Existing group membership must be retained');
        }
        promoted += result.promoted;
        normalized += result.normalized;
        review.push(...result.review.map(group => ({ guide: entry['name'], group })));
        if (BSON.EJSON.stringify(source) === BSON.EJSON.stringify(result.template)) return entry;
        guides++;
        return { ...entry, [field]: result.template };
    };
    const story = (document['story'] ?? []).map((section: Document) => {
        if (section['kind'] === 'story') return rewrite(section);
        const category = section['category'];
        if (!category?.content?.subsections) return section;
        return { ...section, category: { ...category, content: { ...category.content, subsections: category.content.subsections.map(rewrite) } } };
    });
    return { story, guides, promoted, normalized, review };
}
