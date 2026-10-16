import { storyContentName } from '../../../../common/story-content-types';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { GameImagePicker } from './game-image-picker';
import { NotesMarkdownPipe } from './markdown';
import { Entry, WorkspaceStore, GAMES } from './workspace.store';
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
    imports: [FormsModule, DatePipe, NgTemplateOutlet, GameImagePicker, NotesMarkdownPipe],
    templateUrl: './patch-overview.html',
    styleUrl: './patch-overview.scss',
})
export class PatchOverviewTemplate {
    readonly entry = input.required<Entry>();
    readonly editing = input(false);
    readonly incompleteOnly = input(false);
    readonly store = inject(WorkspaceStore);
    readonly groupedTemplate = computed(() => ['world-quests', 'lore', 'character-information'].includes(this.entry().category));
    readonly storyBanner = computed(() => ['main-story', 'side-stories', 'events'].includes(this.entry().category));
    readonly data = computed(() => (this.entry().category === 'events' ? this.entry().eventStory : this.entry().category === 'character-information' ? this.entry().characterInformation : this.entry().category === 'lore' ? this.entry().lore
            : this.entry().category === 'world-quests' ? this.entry().worldQuests : this.entry().category === 'side-stories' ? this.entry().sideStories : this.entry().category === 'main-story' ? this.entry().mainStory : this.entry().patchOverview) ?? emptyPatchOverview());
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
    readonly storyTemplateName = computed(() => storyContentName(this.entry().game, this.entry().category === 'events' ? 'events' : this.entry().category === 'side-stories' ? 'side-stories' : 'main-story'));
    readonly gameName = computed(
        () => GAMES.find((game) => game.id === this.entry().game)?.name ?? '',
    );
    groupAnchor(id: string): string {
        return `patch-group-${this.entry().id}-${id || 'overview'}`;
    }
    groupCompleted(rows: StoryTableRow[]): number {
        return rows.filter((row) => (!row.rowType || row.rowType === 'quest') && this.entry().storyRowCompletion?.[row.id] === true).length;
    }
    questCount(rows: StoryTableRow[]): number {
        return rows.filter((row) => !row.rowType || row.rowType === 'quest').length;
    }
    groups() {
        const groups = patchGroups(this.data());
        if (!this.incompleteOnly() || this.editing()) return groups;
        return groups.map((group) => ({ ...group, rows: group.rows.filter((row) =>
            row.rowType === 'heading' || row.rowType === 'note' || !this.entry().storyRowCompletion?.[row.id],
        ) })).filter((group) => this.questCount(group.rows) > 0);
    }
    addGroup(): void {
        preparePatchGroups(this.data());
        this.data().groups!.push({ id: crypto.randomUUID(), title: 'New group' });
    }
    removeGroup(id: string): void {
        preparePatchGroups(this.data());
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
            ...(this.groupedTemplate() ? { rowType } : {}),
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
        await this.store.save({
            ...entry,
            storyRowCompletion: {
                ...entry.storyRowCompletion,
                [row.id]: !entry.storyRowCompletion?.[row.id],
            },
        });
    }
}
