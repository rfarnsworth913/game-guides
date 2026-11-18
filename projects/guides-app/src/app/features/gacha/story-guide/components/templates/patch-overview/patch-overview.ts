import { storyContentName } from "../../../../../../../../../common/quests/story-content-types";
import { eventStoryProfile } from "../../../../../../../../../common/events/event-story";
import { afterNextRender, Component, computed, ElementRef, inject, Injector, input, signal, TemplateRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { GameImagePicker } from "../../../../../../shared/components/image-selector/game-image-picker";
import { Entry, WorkspaceStore, GAMES } from "../../../../../../core/state/workspace.store";
import { StoryContentList } from "../../content-list/story-content-list";
import { storyRequirementLinks } from '../../../utils/story-requirement-links';
import { StorySubtypeEditor } from '../../context-editor/story-subtype-editor';
import { StoryContextEditor } from "../../context-editor/story-context-editor";
import { MarkdownPipe } from "../../../../../../shared/pipes/markdown/markdown";
import { worldQuestPrerequisites } from "../../../../../../../../../common/quests/world-quest";
import { PatchBadge } from "../../../../shared/components/patch-badge/patch-badge";
import type { StoryGroup } from "../../../../../../../../../lib/types/story-group.type";
import { StoryAvailability, StoryTrackingMode } from "../../../../../../../../../lib/enums/story-tracking.enum";
import type { StoryContext } from "../../../../../../../../../lib/types/story-context.type";
import { storyCompletionKey, storyRowDone, storyTemplateFor, storyTrackingMode } from "../../../../../../../../../common/quests/story-guide";
import { emptyPatchOverview, httpUrl, storyImageUrl, patchGroups, preparePatchGroups } from "../../../../../../../../../common/quests/story-template";
import type { StoryTableRow } from "../../../../../../../../../lib/types/story-template.type";
import { characterStoryProfile } from '../../../../../../../../../common/characters/character-story';
import { WORLD_QUEST_GROUP_TYPES } from '../../../../../../../../../lib/constants/world-quest.constants';

@Component({
    selector: 'gg-patch-overview',
    imports: [FormsModule, DatePipe, NgTemplateOutlet, GameImagePicker, StoryContentList, StoryContextEditor, StorySubtypeEditor, MarkdownPipe, PatchBadge],
    templateUrl: "./patch-overview.html",
    styleUrls: ["./patch-overview.scss", "./patch-hero.scss", "./primary-quest-hero.scss", "./event-reading.scss", "./character-profile.scss", "./world-quest-title.scss", "./section-editor.scss", "./section-editor-nav.scss", "./group-editor-cards.scss", "./row-editor-list.scss", "./row-editor-fields.scss"],
})
export class PatchOverviewTemplate {
    readonly worldGroupTypes = WORLD_QUEST_GROUP_TYPES;
    private readonly injector = inject(Injector);
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    readonly entry = input.required<Entry>();
    readonly editing = input(false);
    readonly overviewFields = input<TemplateRef<unknown> | null>(null);
    readonly editorSelection = signal<string | null>(null);
    readonly templateDetailsOpen = signal(false);
    readonly draggingGroup = signal('');
    readonly groupDropTarget = signal('');
    readonly groupDropAfter = signal(false);
    readonly groupAnnouncement = signal('');
    readonly patchListId = 'editor-patch-versions-' + crypto.randomUUID();
    readonly incompleteOnly = input(false);
    readonly store = inject(WorkspaceStore);
    readonly availableCharacters = computed(() => (this.store.entries?.() ?? []).filter(item => item.kind === 'characters' && item.game === this.entry().game).sort((a, b) => a.name.localeCompare(b.name)));
    readonly availableEvents = computed(() => (this.store.entries?.() ?? []).filter(item => item.kind === 'events' && item.game === this.entry().game).sort((a, b) => a.name.localeCompare(b.name)));
    selectEvent(id: string): void {
        const event = this.availableEvents().find(item => item.id === id);
        if (!event) {return;}
        this.entry().eventId = id;
        this.entry().name = event.name;
        const profile = this.data();
        for (const key of Object.keys(profile)) {Reflect.deleteProperty(profile, key);}
        Object.assign(profile, eventStoryProfile(event));
    }
    selectCharacter(id: string): void {
        const character = this.availableCharacters().find(item => item.id === id);
        if (!character) {return;}
        this.entry().characterId = id;
        const profile = this.data();
        for (const key of Object.keys(profile)) {Reflect.deleteProperty(profile, key);}
        Object.assign(profile, characterStoryProfile(character));
    }
    readonly completionError = signal('');
    readonly groupedTemplate = computed(() => ['world-quests', 'lore', 'character-information'].includes(this.entry().category));
    readonly storyBanner = computed(() => ['main-story', 'side-stories', 'events', 'endgame-activity'].includes(this.entry().category));
    readonly data = computed(() => {
        const data = storyTemplateFor(this.entry()) ?? emptyPatchOverview();
        if (this.editing()) {preparePatchGroups(data);}
        return data;
    });
    readonly relatedEntries = computed(() => this.store.entries?.() ?? []);
    private readonly requirementLinks = computed(() => storyRequirementLinks(this.relatedEntries(), this.entry().game));
    requirementTarget(id?: string) {return this.requirementLinks().find(link => link.id === id);}
    readonly done = (row: StoryTableRow) => storyRowDone(this.entry(), row);
    readonly canTrack = (row: StoryTableRow) => storyCompletionKey(this.entry(), row) !== null;
    editorContext(): StoryContext { const data = this.data(); data.context ??= {}; return data.context; }
    rowContext(row: StoryTableRow): StoryContext { row.context ??= {}; return row.context; }
    readonly mainQuestTemplate = computed(() => ['main-story', 'side-stories'].includes(this.entry().category));
    readonly questEditorLabel = computed(() => this.entry().category === 'side-stories' ? storyContentName(this.entry().game, 'side-stories') : 'Main Quest');
    readonly eventTemplate = computed(() => this.entry().category === 'events');
    readonly eventPatchVersion = computed(() => {
        if (this.data().patchVersion) {return this.data().patchVersion;}
        const versions = [...new Set(this.data().rows.filter(row => !row.rowType || row.rowType === 'quest').map(row => row.patch).filter(Boolean))];
        return versions.length === 1 ? versions[0] : '';
    });
    readonly eventAvailability = computed(() => {
        const availability = this.data().context?.availability;
        return availability === StoryAvailability.Limited ? 'Limited-time' : availability === StoryAvailability.Permanent ? 'Permanent' : availability === StoryAvailability.Recurring ? 'Recurring' : availability === StoryAvailability.Retired ? 'Retired' : 'Not specified';
    });
    readonly eventProgress = computed(() => {
        const rows = this.data().rows.filter(row => (!row.rowType || row.rowType === 'quest') && !row.optional);
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
        group.mainQuest ??= { id: crypto.randomUUID(), groupId: group.id, content: group.title, contentUrl: '', contentType: '', patch: group.defaultPatch ?? '', notes: '' };
        return group.mainQuest;
    }
    setMainQuestTitle(group: StoryGroup, title: string): void {
        group.title = title;
        this.ensureMainQuest(group).content = title;
    }
    promoteMainQuest(row: StoryTableRow): void {
        const group = this.data().groups?.find(group => group.id === row.groupId);
        if (!group || !this.isQuestGroup(group)) {return;}
        const previous = group.mainQuest;
        this.data().rows = this.data().rows.filter(item => item.id !== row.id);
        if (previous) {this.data().rows.unshift({ ...previous, groupId: group.id, subQuest: false });}
        group.mainQuest = row;
        group.title = row.content;
    }
    trackingLabel(row?: StoryTableRow): string {
        const mode = storyTrackingMode(this.entry(), row);
        return mode === StoryTrackingMode.Recurring ? 'This cycle' : mode.charAt(0).toUpperCase() + mode.slice(1);
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
    rowKind(row: StoryTableRow): string {
        return row.rowType === 'heading' ? 'Heading' : row.rowType === 'note' ? 'Note' : httpUrl(row.contentUrl || row.content) ? 'Link' : 'Text';
    }
    availablePatches(): string[] {
        const templates = [this.data(), ...this.relatedEntries().filter(entry => entry.game === this.entry().game).map(entry => storyTemplateFor(entry)).filter(template => !!template)];
        return [...new Set(templates.flatMap(template => [template.patchVersion ?? '', ...template.groups?.map(group => group.defaultPatch ?? '') ?? [], ...template.rows.map(row => row.patch)]).map(version => version.trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, globalThis.undefined, { numeric: true }));
    }
    closeRowMenu(event: FocusEvent): void {
        const menu = event.currentTarget as HTMLDetailsElement;
        if (!(event.relatedTarget instanceof Node) || !menu.contains(event.relatedTarget)) {menu.open = false;}
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
        if (event.dataTransfer) {event.dataTransfer.effectAllowed = 'move';}
        this.draggingRow.set(row.id);
        this.expandedRow.set('');
    }
    allowRowDrop(event: DragEvent, row: StoryTableRow): void {
        const source = this.data().rows.find((item) => item.id === this.draggingRow());
        if (!source || (source.groupId ?? '') !== (row.groupId ?? '')) {return;}
        event.preventDefault();
        if (event.dataTransfer) {event.dataTransfer.dropEffect = 'move';}
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
            afterNextRender(() => {
                const card = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-story-editor-row]')]
                    .find(element => element.dataset['storyEditorRow'] === source.id);
                const handle = card?.querySelector<HTMLButtonElement>('.row-drag-handle');
                if (!this.editing() || !card || !handle) {return;}
                handle.focus({ preventScroll: true });
                card.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
            }, { injector: this.injector });
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
        () => (this.store.games?.() ?? GAMES).find((game) => game.id === this.entry().game)?.name ?? '',
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
        if (!this.incompleteOnly() || this.editing()) {return groups;}
        return groups.map((group) => ({ ...group, rows: group.rows.filter((row) =>
            row.rowType === 'heading' || row.rowType === 'note' || !this.done(row),
        ) })).filter((group) => this.questCount(group.rows) > 0);
    }
    addGroup(groupType: 'quest' | 'content' = 'quest'): void {
        preparePatchGroups(this.data());
        const narrative = this.mainQuestTemplate();
        const group: StoryGroup = { id: crypto.randomUUID(), title: narrative && groupType === 'quest' ? 'New ' + this.questEditorLabel().toLowerCase() : 'New group', ...(narrative ? { groupType } : {}) };
        if (this.isQuestGroup(group)) {this.ensureMainQuest(group);}
        this.data().groups!.push(group);
        this.selectEditorPanel(group.id);
    }
    removeGroup(id: string): void {
        preparePatchGroups(this.data());
        const parent = this.data().groups!.find(group => group.id === id)?.mainQuest;
        if (parent) {this.data().rows.push(parent);}
        this.data().groups = this.data().groups!.filter((group) => group.id !== id);
        for (const row of this.data().rows) {if (row.groupId === id) {delete row.groupId;}}
        if (this.editorSelection() === id) {this.selectEditorPanel(this.rowsForGroup('').length ? '' : this.data().groups?.[0]?.id ?? null);}
    }
    moveGroup(index: number, direction: number): void {
        const groups = this.data().groups ?? [];
        const target = index + direction;
        if (target < 0 || target >= groups.length) {return;}
        [groups[index], groups[target]] = [groups[target], groups[index]];
        this.groupAnnouncement.set(`${groups[target].title} moved to position ${target + 1} of ${groups.length}.`);
    }
    editorPanelTitle(): string {
        if (this.templateDetailsOpen()) {return 'Template Details';}
        const selected = this.editorSelection();
        return selected === null ? 'Overview' : selected === '' ? 'Ungrouped content'
            : this.data().groups?.find(group => group.id === selected)?.title || 'Content group';
    }
    selectEditorPanel(id: string | null): void {
        this.templateDetailsOpen.set(false);
        this.editorSelection.set(id);
        afterNextRender(() => {
            const pane = this.host.nativeElement.querySelector<HTMLElement>('.section-editor-main');
            if (pane) {pane.scrollTop = 0;}
        }, { injector: this.injector });
    }
    selectTemplateDetails(): void {
        this.selectEditorPanel(null);
        this.templateDetailsOpen.set(true);
    }
    startGroupDrag(event: DragEvent, group: StoryGroup): void {
        if (!this.editing()) {event.preventDefault(); return;}
        this.endRowDrag();
        this.draggingGroup.set(group.id);
        event.dataTransfer?.setData('application/x-story-group', group.id);
        if (event.dataTransfer) {event.dataTransfer.effectAllowed = 'move';}
    }
    allowGroupDrop(event: DragEvent, group: StoryGroup): void {
        if (!this.draggingGroup() || this.draggingGroup() === group.id) {return;}
        event.preventDefault();
        if (event.dataTransfer) {event.dataTransfer.dropEffect = 'move';}
        const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
        this.groupDropTarget.set(group.id);
        this.groupDropAfter.set(event.clientY > bounds.top + bounds.height / 2);
    }
    dropGroup(event: DragEvent, target: StoryGroup): void {
        event.preventDefault();
        const groups = this.data().groups ?? [];
        const source = groups.find(group => group.id === this.draggingGroup());
        if (this.editing() && source && source !== target && groups.includes(target)) {
            const next = groups.filter(group => group !== source);
            next.splice(next.indexOf(target) + (this.groupDropAfter() ? 1 : 0), 0, source);
            this.data().groups = next;
            this.selectEditorPanel(source.id);
            this.groupAnnouncement.set(`${source.title} moved to position ${next.indexOf(source) + 1} of ${next.length}.`);
            this.focusGroup(source.id);
        }
        this.endGroupDrag();
    }
    endGroupDrag(): void {this.draggingGroup.set(''); this.groupDropTarget.set('');}
    groupKeydown(event: KeyboardEvent, index: number): void {
        if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) {return;}
        event.preventDefault();
        const id = this.data().groups?.[index]?.id;
        this.moveGroup(index, event.key === 'ArrowUp' ? -1 : 1);
        if (id) {this.selectEditorPanel(id); this.focusGroup(id);}
    }
    private focusGroup(id: string): void {
        afterNextRender(() => {
            const button = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-editor-group]')]
                .find(element => element.dataset['editorGroup'] === id)?.querySelector<HTMLButtonElement>('.editor-group-link');
            button?.focus({ preventScroll: true });
            button?.scrollIntoView?.({ block: 'center', behavior: 'instant' });
        }, { injector: this.injector });
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
    moveRow(index: number, direction: number): void {
        const rows = this.data().rows;
        const target = this.rowTarget(index, direction);
        if (target < 0) {return;}
        [rows[index], rows[target]] = [rows[target], rows[index]];
    }
    rowTarget(index: number, direction: number): number {
        const rows = this.data().rows;
        for (
            let target = index + direction;
            target >= 0 && target < rows.length;
            target += direction
        ) {
            if (rows[target].groupId === rows[index].groupId) {return target;}
        }
        return -1;
    }
    async toggle(row: StoryTableRow): Promise<void> {
        const entry = this.entry();
        const key = storyCompletionKey(entry, row);
        if (key === null || row.rowType === 'heading' || row.rowType === 'note') {return;}
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
