import { storyContentName } from '../../../../common/story-content-types';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { GameImagePicker } from './game-image-picker';
import { Entry, WorkspaceStore, GAMES } from './workspace.store';
import { StoryContentList } from './story-content-list';
import { StoryContextEditor } from './story-context-editor';
import { NotesMarkdownPipe } from './markdown';
import { worldQuestPrerequisites } from '../../../../common/world-quest';
import { PatchBadge } from './patch-badge';
import type { StoryGroup } from '../../../../common/types/story-group.type';
import { StoryAvailability } from '../../../../common/enums/story-tracking.enum';
import { StoryContext, storyCompletionKey, storyRowDone, storyTemplateFor, storyTrackingMode } from '../../../../common/story-guide';
import {
    emptyPatchOverview,
    httpUrl,
    storyImageUrl,
    StoryTableRow,
    patchGroups,
    preparePatchGroups,
} from '../../../../common/story-template';

@Component({
    selector: 'gg-patch-overview',
    imports: [FormsModule, DatePipe, NgTemplateOutlet, GameImagePicker, StoryContentList, StoryContextEditor, NotesMarkdownPipe, PatchBadge],
    templateUrl: './patch-overview.html',
    styleUrl: './patch-overview.scss',
})
export class PatchOverviewTemplate {
    readonly entry = input.required<Entry>();
    readonly editing = input(false);
    readonly incompleteOnly = input(false);
    readonly store = inject(WorkspaceStore);
    readonly completionError = signal('');
    readonly groupedTemplate = computed(() => ['world-quests', 'lore', 'character-information'].includes(this.entry().category));
    readonly storyBanner = computed(() => ['main-story', 'side-stories', 'events', 'endgame-activity'].includes(this.entry().category));
    readonly data = computed(() => storyTemplateFor(this.entry()) ?? emptyPatchOverview());
    readonly relatedEntries = computed(() => this.store.entries?.() ?? []);
    readonly done = (row: StoryTableRow) => storyRowDone(this.entry(), row);
    readonly canTrack = (row: StoryTableRow) => storyCompletionKey(this.entry(), row) !== null;
    editorContext(): StoryContext { return this.data().context ??= {}; }
    rowContext(row: StoryTableRow): StoryContext { return row.context ??= {}; }
    readonly mainQuestTemplate = computed(() => ['main-story', 'side-stories'].includes(this.entry().category));
    readonly questEditorLabel = computed(() => this.entry().category === 'side-stories' ? storyContentName(this.entry().game, 'side-stories') : 'Main Quest');
    readonly eventTemplate = computed(() => this.entry().category === 'events');
    readonly eventPatchVersion = computed(() => {
        if (this.data().patchVersion) return this.data().patchVersion;
        const versions = [...new Set(this.data().rows.filter(row => !row.rowType || row.rowType === 'quest').map(row => row.patch).filter(Boolean))];
        return versions.length === 1 ? versions[0] : '';
    });
    readonly eventAvailability = computed(() => {
        const availability = this.data().context?.availability;
        return availability === StoryAvailability.Limited ? 'Limited-time' : availability === StoryAvailability.Permanent ? 'Permanent' : availability === StoryAvailability.Recurring ? 'Recurring' : availability === StoryAvailability.Retired ? 'Retired' : 'Not specified';
    });
    readonly eventProgress = computed(() => {
        const rows = this.data().rows.filter(row => !row.rowType || row.rowType === 'quest');
        return { total: rows.length, completed: rows.filter(this.done).length };
    });
    readonly eventGates = computed(() => worldQuestPrerequisites(this.data().context));
    readonly eventNotes = computed(() => this.data().context?.requirements?.filter(item => !['prerequisite', 'unlock', 'time-gate'].includes(item.type)) ?? []);
    readonly eventHasDetails = computed(() => !!(this.data().summary || this.eventGates()?.length || this.eventNotes().length || this.data().context?.relatedContentIds?.length));
    eventRelated(id?: string): Entry[] {
        const ids = id ? [id] : this.data().context?.relatedContentIds ?? [];
        return this.relatedEntries().filter(entry => entry.game === this.entry().game && ids.includes(entry.id));
    }
    eventRelatedUrl(entry: Entry): string {
        return entry.kind === 'story' ? `/games/${entry.game}/story?section=${encodeURIComponent(entry.storySection ?? '')}#story-content-${encodeURIComponent(entry.id)}`
            : `/games/${entry.game}/${entry.kind === 'achievement-category' ? 'achievements' : entry.kind}`;
    }
    isQuestGroup(group: StoryGroup): boolean {
        return this.mainQuestTemplate() && group.groupType !== 'content';
    }
    ensureMainQuest(group: StoryGroup): StoryTableRow {
        return group.mainQuest ??= { id: crypto.randomUUID(), groupId: group.id, content: group.title, contentUrl: '', contentType: '', patch: group.defaultPatch ?? '', notes: '' };
    }
    setMainQuestTitle(group: StoryGroup, title: string): void {
        group.title = title;
        this.ensureMainQuest(group).content = title;
    }
    promoteMainQuest(row: StoryTableRow): void {
        const group = this.data().groups?.find(group => group.id === row.groupId);
        if (!group || !this.isQuestGroup(group)) return;
        const previous = group.mainQuest;
        this.data().rows = this.data().rows.filter(item => item.id !== row.id);
        if (previous) this.data().rows.unshift({ ...previous, groupId: group.id, subQuest: false });
        group.mainQuest = row;
        group.title = row.content;
    }
    trackingLabel(row?: StoryTableRow): string {
        const mode = storyTrackingMode(this.entry(), row);
        return mode === 'recurring' ? 'This cycle' : mode.charAt(0).toUpperCase() + mode.slice(1);
    }
    readonly failedImage = signal('');
    readonly expandedRow = signal('');
    readonly multilineRows = signal<string[]>([]);
    readonly draggingRow = signal('');
    readonly rowDropTarget = signal('');
    readonly rowDropAfter = signal(false);
    toggleMultiline(id: string): void {
        this.multilineRows.update((rows) => rows.includes(id) ? rows.filter((row) => row !== id) : [...rows, id]);
    }
    rowTitle(row: StoryTableRow): string {
        return (row.rowType === 'note' ? row.notes : row.content).trim().split('\n')[0] ||
            (row.rowType === 'heading' ? 'New heading' : row.rowType === 'note' ? 'Global notes' : 'Untitled content');
    }
    toggleRow(event: Event, id: string): void {
        event.preventDefault();
        this.expandedRow.set(this.expandedRow() === id ? '' : id);
    }
    resizeNotes(event: Event): void {
        const input = event.target as HTMLTextAreaElement;
        input.style.height = 'auto';
        input.style.height = `${input.scrollHeight}px`;
    }
    startRowDrag(event: DragEvent, row: StoryTableRow): void {
        if (!this.editing()) { event.preventDefault(); return; }
        event.dataTransfer?.setData('text/plain', row.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        this.draggingRow.set(row.id);
        this.expandedRow.set('');
    }
    allowRowDrop(event: DragEvent, row: StoryTableRow): void {
        const source = this.data().rows.find((item) => item.id === this.draggingRow());
        if (!source || (source.groupId ?? '') !== (row.groupId ?? '')) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
        this.rowDropTarget.set(row.id);
        this.rowDropAfter.set(event.clientY > bounds.top + bounds.height / 2);
    }
    dropRow(event: DragEvent, target: StoryTableRow): void {
        event.preventDefault();
        const rows = this.data().rows;
        const source = rows.find((row) => row.id === this.draggingRow());
        if (source && source !== target && (source.groupId ?? '') === (target.groupId ?? '')) {
            const next = rows.filter((row) => row !== source);
            next.splice(next.indexOf(target) + (this.rowDropAfter() ? 1 : 0), 0, source);
            this.data().rows = next;
        }
        this.endRowDrag();
    }
    endRowDrag(): void {
        this.draggingRow.set('');
        this.rowDropTarget.set('');
    }
    readonly standalone = { standalone: true };
    readonly httpUrl = httpUrl;
    readonly imageUrl = storyImageUrl;
    readonly storyTemplateName = computed(() => storyContentName(this.entry().game, this.entry().category === 'endgame-activity' ? 'endgame-activity' : this.entry().category === 'events' ? 'events' : this.entry().category === 'side-stories' ? 'side-stories' : 'main-story'));
    readonly gameName = computed(
        () => GAMES.find((game) => game.id === this.entry().game)?.name ?? '',
    );
    groupAnchor(id: string): string {
        return `patch-group-${this.entry().id}-${id || 'overview'}`;
    }
    groupCompleted(rows: StoryTableRow[]): number {
        return rows.filter((row) => (!row.rowType || row.rowType === 'quest') && this.done(row)).length;
    }
    questCount(rows: StoryTableRow[]): number {
        return rows.filter((row) => !row.rowType || row.rowType === 'quest').length;
    }
    groups() {
        const groups = patchGroups(this.data());
        if (!this.incompleteOnly() || this.editing()) return groups;
        return groups.map((group) => ({ ...group, rows: group.rows.filter((row) =>
            row.rowType === 'heading' || row.rowType === 'note' || !this.done(row),
        ) })).filter((group) => this.questCount(group.rows) > 0);
    }
    addGroup(groupType: 'quest' | 'content' = 'quest'): void {
        preparePatchGroups(this.data());
        const narrative = this.mainQuestTemplate();
        const group: StoryGroup = { id: crypto.randomUUID(), title: narrative && groupType === 'quest' ? 'New ' + this.questEditorLabel().toLowerCase() : 'New group', ...(narrative ? { groupType } : {}) };
        if (this.isQuestGroup(group)) this.ensureMainQuest(group);
        this.data().groups!.push(group);
    }
    removeGroup(id: string): void {
        preparePatchGroups(this.data());
        const parent = this.data().groups!.find(group => group.id === id)?.mainQuest;
        if (parent) this.data().rows.push(parent);
        this.data().groups = this.data().groups!.filter((group) => group.id !== id);
        for (const row of this.data().rows) if (row.groupId === id) delete row.groupId;
    }
    moveGroup(index: number, direction: number): void {
        const groups = this.data().groups ?? [];
        const target = index + direction;
        if (target < 0 || target >= groups.length) return;
        [groups[index], groups[target]] = [groups[target], groups[index]];
    }
    rowsForGroup(id: string): StoryTableRow[] {
        return this.data().rows.filter((row) => (row.groupId ?? '') === id);
    }
    addRow(groupId = '', rowType: StoryTableRow['rowType'] = 'quest'): void {
        const id = crypto.randomUUID();
        this.data().rows.push({
            id,
            rowType,
            contentType: '',
            ...(groupId ? { groupId } : {}),
            content: '',
            patch: this.data().groups?.find((group) => group.id === groupId)?.defaultPatch ?? '',
            notes: '',
        });
        this.expandedRow.set(id);
    }
    removeRow(id: string): void {
        this.data().rows = this.data().rows.filter((row) => row.id !== id);
        for (const group of this.data().groups ?? []) {
            if (group.objectiveIds) {
                group.objectiveIds = group.objectiveIds.filter(objectiveId => objectiveId !== id);
            }
        }
    }
    splitNotes(row: StoryTableRow, split: boolean): void {
        if (split) row.notesRight = '';
        else {
            row.notes = [row.notes, row.notesRight].filter(Boolean).join('\n');
            delete row.notesRight;
        }
    }
    moveRow(index: number, direction: number): void {
        const rows = this.data().rows;
        const target = this.rowTarget(index, direction);
        if (target < 0) return;
        [rows[index], rows[target]] = [rows[target], rows[index]];
    }
    rowTarget(index: number, direction: number): number {
        const rows = this.data().rows;
        for (
            let target = index + direction;
            target >= 0 && target < rows.length;
            target += direction
        ) {
            if (rows[target].groupId === rows[index].groupId) return target;
        }
        return -1;
    }
    async toggle(row: StoryTableRow): Promise<void> {
        const entry = this.entry();
        const key = storyCompletionKey(entry, row);
        if (key === null || row.rowType === 'heading' || row.rowType === 'note') return;
        this.completionError.set('');
        try {
            const saved = await this.store.save({
                ...entry,
                storyRowCompletion: {
                    ...entry.storyRowCompletion,
                    [key]: !entry.storyRowCompletion?.[key],
                },
            });
            if (!saved) {
                this.completionError.set(this.store.error?.() || 'Could not save completion. Please retry.');
            }
        } catch (error) {
            this.completionError.set(error instanceof Error ? error.message : 'Could not save completion. Please retry.');
        }
    }
}
