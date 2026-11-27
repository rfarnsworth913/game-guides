import type { Entry } from '@lib/types/workspace.type';
import type { PatchOverview } from '@lib/types/story-template.type';
import { REMOVABLE_STORY_FIELDS } from '@lib/constants/story-preservation.constants';
import { storyTemplateFor } from './story-guide';

const allowed = new Set<string>(REMOVABLE_STORY_FIELDS);

export function removePreservedStoryField(entry: Entry, data: PatchOverview, field: keyof PatchOverview): void {
    const paths = field === 'context'
        ? [...new Set(['availability', 'startDate', 'endDate', ...Object.entries(data.context ?? {}).filter(([, value]) => value !== globalThis.undefined && value !== '').map(([key]) => key)])].map(key => `context.${key}`)
        : [field];
    const supported = paths.filter(path => allowed.has(path));
    if (!supported.length) {return;}
    entry.removedPreservedFields = [...new Set([...entry.removedPreservedFields ?? [], ...supported])];
    Reflect.deleteProperty(data, field);
}

/** The caller supplies a detached profile, so canonical game/account records stay untouched. */
export function applyPreservedFieldRemovals(entry: Pick<Entry, 'removedPreservedFields'>, profile: PatchOverview): PatchOverview {
    if (!entry.removedPreservedFields?.length) {return profile;}
    for (const path of entry.removedPreservedFields ?? []) {
        if (!allowed.has(path)) {continue;}
        if (path.startsWith('context.')) {
            if (profile.context) {Reflect.deleteProperty(profile.context, path.slice('context.'.length));}
        } else {Reflect.deleteProperty(profile, path);}
    }
    if (profile.context && !Object.values(profile.context).some(value => value !== globalThis.undefined)) {delete profile.context;}
    return profile;
}

/** A deliberate new value in an editable field restores it; empty editor scaffolding does not. */
export function reconcilePreservedFieldRemovals(entry: Entry): void {
    if (!entry.removedPreservedFields) {return;}
    const data = entry.storyContent ?? storyTemplateFor(entry);
    const remaining = entry.removedPreservedFields.filter(path => {
        const value = path.startsWith('context.') ? Reflect.get(data?.context ?? {}, path.slice('context.'.length)) as unknown : Reflect.get(data ?? {}, path) as unknown;
        return value === globalThis.undefined || value === '';
    });
    if (remaining.length) {entry.removedPreservedFields = remaining;}
    else {delete entry.removedPreservedFields;}
}
