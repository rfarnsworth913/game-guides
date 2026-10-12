export type StoryTableRow = {
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
    region?: string;
    subtitle?: string;
    versionImageUrl?: string;
    patchVersion?: string;
    patchTitle?: string;
    releaseDate?: string;
    summary?: string;
    groups?: { id: string; title: string }[];
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
    const fields = ['imageUrl', 'imageAlt', 'sourceName', 'sourceUrl', 'versionImageUrl',
        'patchVersion', 'patchTitle', 'releaseDate', 'summary', 'region', 'subtitle'] as const;
    for (const key of fields) {
        const value = patch[key];
        if (typeof value === 'string') patch[key] = value.trim();
    }
    for (const group of patch.groups ?? []) group.title = group.title.trim();
    for (const row of patch.rows) {
        for (const key of ['contentType', 'content', 'contentUrl', 'patch', 'notes', 'notesRight'] as const) {
            const value = row[key];
            if (typeof value === 'string') row[key] = value.trim();
        }
    }
}

/** Preserve existing content-type labels as editable groups without changing row IDs. */
export function patchGroups(
    patch: PatchOverview,
): { id: string; title: string; rows: StoryTableRow[] }[] {
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
        [patch.imageUrl, patch.imageAlt, patch.sourceName, patch.sourceUrl].every(
            (item) => typeof item === 'string',
        ) &&
        (!patch.imageUrl || !!storyImageUrl(patch.imageUrl)) &&
        (patch.versionImageUrl === undefined ||
            (typeof patch.versionImageUrl === 'string' &&
                (!patch.versionImageUrl || !!storyImageUrl(patch.versionImageUrl)))) &&
        (!patch.sourceUrl || !!httpUrl(patch.sourceUrl)) &&
        [patch.patchVersion, patch.patchTitle, patch.releaseDate, patch.summary, patch.region, patch.subtitle].every(
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
                        Object.keys(group).every((key) => ['id', 'title'].includes(key)) &&
                        typeof group.id === 'string' &&
                        !!group.id &&
                        typeof group.title === 'string' &&
                        !!group.title.trim(),
                ) &&
                new Set(patch.groups.map((group) => group.id)).size === patch.groups.length)) &&
        Array.isArray(patch.rows) &&
        patch.rows.every(
            (row) =>
                row &&
                Object.keys(row).every((key) =>
                    [
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
                (row.rowType === undefined || ['quest', 'heading', 'note'].includes(row.rowType)) &&
                typeof row.id === 'string' &&
                (row.subQuest === undefined || typeof row.subQuest === 'boolean') &&
                !!row.id &&
                [row.contentType, row.content, row.patch, row.notes].every(
                    (item) => typeof item === 'string',
                ) &&
                (row.notesRight === undefined || typeof row.notesRight === 'string'),
        ) &&
        patch.rows.every(
            (row) =>
                (row.contentUrl === undefined ||
                    (typeof row.contentUrl === 'string' &&
                        (!row.contentUrl || !!httpUrl(row.contentUrl)))) &&
                (row.groupId === undefined ||
                    (typeof row.groupId === 'string' &&
                        patch.groups?.some((group) => group.id === row.groupId))),
        ) &&
        new Set(patch.rows.map((row) => row.id)).size === patch.rows.length
    );
}
