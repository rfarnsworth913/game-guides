import { StoryContext, trimStoryContext, validStoryContext } from './story-guide';
import type { StoryGroup } from './types/story-group.type';

export type StoryTableRow = {
    context?: StoryContext;
    id: string;
    subQuest?: boolean;
    rowType?: 'quest' | 'heading' | 'note';
    groupId?: string;
    contentUrl?: string;
    contentType: string;
    content: string;
    patch: string;
    notes: string;
    notesRight?: string;
};
export type PatchOverview = {
    context?: StoryContext;
    imagePositionX?: number;
    imagePositionY?: number;
    characterName?: string;
    damageType?: string;
    damageTypeIcon?: string;
    faction?: string;
    factionIcon?: string;
    region?: string;
    subtitle?: string;
    versionImageUrl?: string;
    patchVersion?: string;
    patchTitle?: string;
    releaseDate?: string;
    summary?: string;
    groups?: StoryGroup[];
    imageUrl: string;
    imageAlt: string;
    sourceName: string;
    sourceUrl: string;
    rows: StoryTableRow[];
};
export const emptyPatchOverview = (): PatchOverview => ({
    imageUrl: '',
    imageAlt: '',
    sourceName: '',
    sourceUrl: '',
    rows: [],
    groups: [],
});

/** Trim user-entered text without changing identifiers or internal formatting. */
export function trimPatchOverviewText(patch: PatchOverview): void {
    trimStoryContext(patch.context);
    const fields = ['imageUrl', 'imageAlt', 'sourceName', 'sourceUrl', 'versionImageUrl',
        'patchVersion', 'patchTitle', 'releaseDate', 'summary', 'region', 'subtitle', 'characterName', 'damageType', 'damageTypeIcon', 'faction', 'factionIcon'] as const;
    for (const key of fields) {
        const value = patch[key];
        if (typeof value === 'string') patch[key] = value.trim();
    }
    for (const group of patch.groups ?? []) {
        group.title = group.title.trim();
        if (group.contentUrl !== undefined) group.contentUrl = group.contentUrl.trim();
        if (group.defaultPatch !== undefined) group.defaultPatch = group.defaultPatch.trim();
        if (group.mainQuest) trimStoryRow(group.mainQuest);
    }
    for (const row of patch.rows) {
        trimStoryRow(row);
    }
}
function trimStoryRow(row: StoryTableRow): void {
    trimStoryContext(row.context);
    for (const key of ['contentType', 'content', 'contentUrl', 'patch', 'notes', 'notesRight'] as const) {
        const value = row[key];
        if (typeof value === 'string') row[key] = value.trim();
    }
}

/** Preserve existing content-type labels as editable groups without changing row IDs. */
export function patchGroups(
    patch: PatchOverview,
): (StoryGroup & { rows: StoryTableRow[] })[] {
    const groups =
        patch.groups ??
        [...new Set(patch.rows.map((row) => row.contentType).filter(Boolean))].map((title) => ({
            id: `legacy:${encodeURIComponent(title)}`,
            title,
        }));
    const groupFor = (row: StoryTableRow) =>
        row.groupId ??
        (patch.groups === undefined && row.contentType
            ? `legacy:${encodeURIComponent(row.contentType)}`
            : '');
    const result = groups.map((group) => ({
        ...group,
        rows: patch.rows.filter((row) => groupFor(row) === group.id),
    }));
    const ungrouped = patch.rows.filter((row) => !groupFor(row));
    if (ungrouped.length || !groups.length)
        result.push({ id: '', title: 'Overview', rows: ungrouped });
    return result;
}

export function preparePatchGroups(patch: PatchOverview): void {
    if (patch.groups !== undefined) return;
    const groups = patchGroups(patch);
    patch.groups = groups.filter((group) => group.id).map(({ id, title }) => ({ id, title }));
    for (const group of groups) {
        if (group.id) for (const row of group.rows) row.groupId = group.id;
    }
}
export function httpUrl(value: string): string | null {
    try {
        const url = new URL(value);
        return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
}
export function storyImageUrl(value: string): string | null {
    return /^\/api\/games\/[a-z]+\/images\/[a-z0-9][a-z0-9-]*\.(png|jpg|webp|gif)$/.test(value)
        ? value
        : httpUrl(value);
}
export function validRowCompletion(value: unknown): value is Record<string, boolean> | undefined {
    return (
        value === undefined ||
        (!!value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            Object.values(value).every((item) => typeof item === 'boolean'))
    );
}
export function validPatchOverview(value: unknown): value is PatchOverview | undefined {
    if (value === undefined) return true;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const patch = value as PatchOverview;
    return (
        Object.keys(patch).every((key) =>
            [
                'context',
                'characterName',
                'damageType',
                'damageTypeIcon',
                'faction',
                'factionIcon',
                'imagePositionX',
                'imagePositionY',
                'region',
                'subtitle',
                'imageUrl',
                'versionImageUrl',
                'imageAlt',
                'sourceName',
                'sourceUrl',
                'rows',
                'groups',
                'patchVersion',
                'patchTitle',
                'releaseDate',
                'summary',
            ].includes(key),
        ) &&
        validStoryContext(patch.context) &&
        [patch.imageUrl, patch.imageAlt, patch.sourceName, patch.sourceUrl].every(
            (item) => typeof item === 'string',
        ) &&
        [patch.imagePositionX, patch.imagePositionY].every((value) => value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100)) &&
        (!patch.imageUrl || !!storyImageUrl(patch.imageUrl)) &&
        (patch.versionImageUrl === undefined ||
            (typeof patch.versionImageUrl === 'string' &&
                (!patch.versionImageUrl || !!storyImageUrl(patch.versionImageUrl)))) &&
        (!patch.sourceUrl || !!httpUrl(patch.sourceUrl)) &&
        [patch.patchVersion, patch.patchTitle, patch.releaseDate, patch.summary, patch.region, patch.subtitle, patch.characterName, patch.damageType, patch.damageTypeIcon, patch.faction, patch.factionIcon].every(
            (value) => value === undefined || typeof value === 'string',
        ) &&
        (!patch.releaseDate ||
            (/^\d{4}-\d{2}-\d{2}$/.test(patch.releaseDate) &&
                Number.isFinite(Date.parse(patch.releaseDate)))) &&
        (patch.groups === undefined ||
            (Array.isArray(patch.groups) &&
                patch.groups.every(
                    (group) =>
                        group &&
                        Object.keys(group).every((key) => ['id', 'title', 'defaultPatch', 'mainQuest', 'worldQuestMode', 'objectiveIds', 'groupType', 'contentUrl'].includes(key)) &&
                        (group.contentUrl === undefined || (typeof group.contentUrl === 'string' && (!group.contentUrl || !!httpUrl(group.contentUrl)))) &&
                        (group.groupType === undefined || ['quest', 'content'].includes(group.groupType)) &&
                        (group.groupType !== 'content' || group.mainQuest === undefined) &&
                        (group.worldQuestMode === undefined || ['region', 'questChain'].includes(group.worldQuestMode)) &&
                        (group.objectiveIds === undefined || (Array.isArray(patch.rows) && Array.isArray(group.objectiveIds) && group.objectiveIds.length <= 1000 && new Set(group.objectiveIds).size === group.objectiveIds.length && group.objectiveIds.every(id => patch.rows.some(row => row && row.id === id && (!row.rowType || row.rowType === 'quest'))))) &&
                        (group.mainQuest === undefined || (validStoryTableRow(group.mainQuest) && (!group.mainQuest.rowType || group.mainQuest.rowType === 'quest') && (!group.mainQuest.groupId || group.mainQuest.groupId === group.id))) &&
                        (group.defaultPatch === undefined || typeof group.defaultPatch === 'string') &&
                        typeof group.id === 'string' &&
                        !!group.id &&
                        typeof group.title === 'string' &&
                        !!group.title.trim(),
                ) &&
                new Set(patch.groups.map((group) => group.id)).size === patch.groups.length)) &&
        Array.isArray(patch.rows) &&
        patch.rows.every(validStoryTableRow) &&
        patch.rows.every(
            (row) =>
                (row.groupId === undefined ||
                    (typeof row.groupId === 'string' &&
                        patch.groups?.some((group) => group.id === row.groupId))),
        ) &&
        new Set([...patch.rows.map((row) => row.id), ...(patch.groups ?? []).flatMap(group => group.mainQuest ? [group.mainQuest.id] : [])]).size === patch.rows.length + (patch.groups ?? []).filter(group => group.mainQuest).length
    );
}

export function validStoryTableRow(value: unknown): value is StoryTableRow {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const row = value as StoryTableRow;
    return (
                Object.keys(row).every((key) =>
                    [
                        'context',
                        'id',
                        'subQuest',
                        'rowType',
                        'contentType',
                        'content',
                        'patch',
                        'notes',
                        'notesRight',
                        'groupId',
                        'contentUrl',
                    ].includes(key),
                ) &&
                validStoryContext(row.context) &&
                (row.rowType === undefined || ['quest', 'heading', 'note'].includes(row.rowType)) &&
                typeof row.id === 'string' &&
                (row.subQuest === undefined || typeof row.subQuest === 'boolean') &&
                !!row.id &&
                [row.contentType, row.content, row.patch, row.notes].every(
                    (item) => typeof item === 'string',
                ) &&
                (row.notesRight === undefined || typeof row.notesRight === 'string') &&
                (row.contentUrl === undefined ||
                    (typeof row.contentUrl === 'string' &&
                        (!row.contentUrl || !!httpUrl(row.contentUrl)))) &&
                (row.groupId === undefined || typeof row.groupId === 'string')
    );
}
