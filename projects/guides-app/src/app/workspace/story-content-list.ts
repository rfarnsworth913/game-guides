import { Component, computed, HostListener, input, output, signal } from '@angular/core';
import { Entry } from './workspace.store';
import { NotesMarkdownPipe } from './markdown';
import { httpUrl, patchGroups, PatchOverview, StoryTableRow } from '../../../../common/story-template';
import { storyCompletionKey, StoryContext, storyRowDone, storyTrackingMode } from '../../../../common/story-guide';
import { StoryTrackingMode } from '../../../../common/enums/story-tracking.enum';
import { storyContentName } from '../../../../common/story-content-types';
import { NgTemplateOutlet } from '@angular/common';
import { worldQuestGroups, worldQuestObjectives, worldQuestPrerequisites } from '../../../../common/world-quest';
import type { WorldQuestSection } from '../../../../common/types/world-quest.type';
import { WORLD_QUEST_SUBTYPES } from '../../../../common/constants/world-quest.constants';
import { PatchBadge } from './patch-badge';

@Component({
    selector: 'gg-story-content-list',
    imports: [NotesMarkdownPipe, NgTemplateOutlet, PatchBadge],
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
    readonly collapsedSections = signal<string[]>([]);
    readonly expandedNotes = signal<string[]>([]);
    readonly worldQuest = computed(() => this.entry().category === 'world-quests');
    readonly worldGroups = computed(() => worldQuestGroups(this.data()));
    readonly visibleWorldGroups = computed(() => this.worldGroups().filter(group => !this.incompleteOnly() || this.countDone(group.rows) < this.count(group.rows)));
    readonly prerequisites = worldQuestPrerequisites;
    readonly httpUrl = httpUrl;
    readonly done = (row: StoryTableRow) => storyRowDone(this.entry(), row);
    readonly canTrack = (row: StoryTableRow) => storyCompletionKey(this.entry(), row) !== null;
    readonly rows = computed(() => this.data().rows.filter(row => !row.rowType || row.rowType === 'quest'));
    readonly completed = computed(() => this.rows().filter(this.done).length);
    readonly reference = computed(() => ['patch-overview', 'lore', 'character-information'].includes(this.entry().category));
    readonly activity = computed(() => this.entry().category === 'endgame-activity');
    readonly eventTemplate = computed(() => this.entry().category === 'events');
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
    toggleRow(event: Event, row: StoryTableRow): void {
        if (event.target instanceof HTMLInputElement) {
            event.target.checked = this.done(row);
        }
        if (this.disabled() || !this.canTrack(row) || row.rowType === 'heading' || row.rowType === 'note') {
            return;
        }
        this.toggled.emit(row);
    }
    toggleGroup(id: string): void {
        this.collapsed.update(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
    }
    toggleSection(id: string): void {
        this.collapsedSections.update(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
    }
    toggleNotes(id: string): void {
        this.expandedNotes.update(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
    }
    visibleRows(rows: StoryTableRow[]): StoryTableRow[] {
        return this.incompleteOnly() ? rows.filter(row => row.rowType === 'heading' || row.rowType === 'note' || !this.done(row)) : rows;
    }
    visibleSection(section: WorldQuestSection): boolean {
        return !this.incompleteOnly() || worldQuestObjectives(section.rows).some(row => !this.done(row));
    }
    subtype(value?: string): string {
        return value ? WORLD_QUEST_SUBTYPES.get(value) ?? value : '';
    }
    worldNotes(row: StoryTableRow) {
        return this.contextNotes(row.context);
    }
    contextNotes(context?: StoryContext) {
        return context?.requirements?.filter(item => !['prerequisite', 'unlock', 'time-gate'].includes(item.type)) ?? [];
    }
    requirementTarget(id?: string): Entry | undefined {
        return this.relatedEntries().find(entry => entry.game === this.entry().game && entry.id === id);
    }
    worldAnchor(row: StoryTableRow, groupId: string): string {
        const first = this.worldGroups().find(group => group.rows.some(item => item.id === row.id));
        return first?.id === groupId ? this.anchor(row) : `${this.anchor(row)}-membership-${groupId}`;
    }
    count(rows: StoryTableRow[]): number { return worldQuestObjectives(rows).length; }
    countDone(rows: StoryTableRow[]): number { return worldQuestObjectives(rows).filter(this.done).length; }
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
        this.collapsedSections.set([]);
    }
}
