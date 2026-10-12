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
    readonly store = inject(WorkspaceStore);
    readonly worldQuests = computed(() => this.entry().category === 'world-quests');
    readonly storyBanner = computed(() => ['main-story', 'side-stories'].includes(this.entry().category));
    readonly data = computed(() => (this.worldQuests() ? this.entry().worldQuests : this.entry().category === 'side-stories' ? this.entry().sideStories : this.entry().category === 'main-story' ? this.entry().mainStory : this.entry().patchOverview) ?? emptyPatchOverview());
    readonly failedImage = signal('');
    readonly standalone = { standalone: true };
    readonly httpUrl = httpUrl;
    readonly imageUrl = storyImageUrl;
    readonly storyTemplateName = computed(() => storyContentName(this.entry().game, this.entry().category === 'side-stories' ? 'side-stories' : 'main-story'));
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
        return patchGroups(this.data());
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
        this.data().rows.push({
            id: crypto.randomUUID(),
            ...(this.worldQuests() ? { rowType } : {}),
            contentType: '',
            ...(groupId ? { groupId } : {}),
            content: '',
            patch: '',
            notes: '',
        });
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
