import { Component, computed, HostListener, input, output, signal } from '@angular/core';
import { Entry } from './workspace.store';
import { NotesMarkdownPipe } from './markdown';
import { httpUrl, patchGroups, PatchOverview, StoryTableRow } from '../../../../common/story-template';
import { storyCompletionKey, StoryContext, storyRowDone, storyTrackingMode } from '../../../../common/story-guide';
import { StoryTrackingMode } from '../../../../common/enums/story-tracking.enum';
import { storyContentName } from '../../../../common/story-content-types';

@Component({
    selector: 'gg-story-content-list',
    imports: [NotesMarkdownPipe],
    templateUrl: './story-content-list.html',
})
export class StoryContentList {
    readonly entry = input.required<Entry>();
    readonly data = input.required<PatchOverview>();
    readonly disabled = input(false);
    readonly incompleteOnly = input(false);
    readonly relatedEntries = input<Entry[]>([]);
    readonly toggled = output<StoryTableRow>();
    readonly collapsed = signal<string[]>([]);
    readonly httpUrl = httpUrl;
    readonly done = (row: StoryTableRow) => storyRowDone(this.entry(), row);
    readonly canTrack = (row: StoryTableRow) => storyCompletionKey(this.entry(), row) !== null;
    readonly rows = computed(() => this.data().rows.filter(row => !row.rowType || row.rowType === 'quest'));
    readonly completed = computed(() => this.rows().filter(this.done).length);
    readonly reference = computed(() => ['patch-overview', 'lore', 'character-information'].includes(this.entry().category));
    readonly activity = computed(() => this.entry().category === 'endgame-activity');
    readonly questTemplate = computed(() => ['main-story', 'side-stories'].includes(this.entry().category));
    readonly mainQuestName = computed(() => storyContentName(this.entry().game, this.entry().category === 'side-stories' ? 'side-stories' : 'main-story'));
    readonly sharedPatch = computed(() => {
        if (this.data().patchVersion) return this.data().patchVersion!;
        const versions = [...new Set(this.rows().map(row => row.patch).filter(Boolean))];
        return versions.length === 1 ? versions[0] : '';
    });
    readonly groups = computed(() => {
        const groups = patchGroups(this.data());
        if (!this.incompleteOnly()) return groups;
        return groups.map(group => ({ ...group, rows: group.rows.filter(row =>
            row.rowType === 'heading' || row.rowType === 'note' || !this.done(row),
        ) })).filter(group => group.rows.some(row => !row.rowType || row.rowType === 'quest'));
    });
    label(row?: StoryTableRow): string {
        const mode = storyTrackingMode(this.entry(), row);
        return mode === StoryTrackingMode.Recurring ? 'This cycle' : mode.charAt(0).toUpperCase() + mode.slice(1);
    }
    toggleGroup(id: string): void {
        this.collapsed.update(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
    }
    count(rows: StoryTableRow[]): number { return rows.filter(row => !row.rowType || row.rowType === 'quest').length; }
    countDone(rows: StoryTableRow[]): number { return rows.filter(row => (!row.rowType || row.rowType === 'quest') && this.done(row)).length; }
    groupProgress(id: string): { total: number; completed: number; percent: number } {
        const rows = patchGroups(this.data()).find(group => group.id === id)?.rows ?? [];
        const total = this.count(rows);
        const completed = this.countDone(rows);
        return { total, completed, percent: total ? Math.round(completed / total * 100) : 0 };
    }
    anchor(row: StoryTableRow): string { return `story-row-${this.entry().id}-${row.id}`; }
    contextText(context?: StoryContext): string {
        return [context?.region, context?.area, context?.chain, context?.subtype, context?.difficulty].filter(Boolean).join(' · ');
    }
    related(ids?: string[]): Entry[] {
        return this.relatedEntries().filter(entry => entry.game === this.entry().game && ids?.includes(entry.id));
    }
    relatedUrl(entry: Entry): string {
        const base = `/games/${entry.game}/`;
        return entry.kind === 'story' ? `${base}story?section=${encodeURIComponent(entry.storySection ?? '')}#story-content-${encodeURIComponent(entry.id)}`
            : `${base}${entry.kind === 'achievement-category' ? 'achievements' : entry.kind}`;
    }
    @HostListener('document:story-guide-reveal', ['$event'])
    revealTarget(event: Event): void {
        if (!(event instanceof CustomEvent) || ![...this.data().rows, ...(this.data().groups ?? []).flatMap(group => group.mainQuest ? [group.mainQuest] : [])].some(row => this.anchor(row) === event.detail)) return;
        this.collapsed.set([]);
    }
}
