import { storyRequirementLinks } from '../../utils/story-requirement-links';
import { Component, computed, HostListener, input, output, signal } from '@angular/core';
import { Entry } from "../../../../../core/state/workspace.store";
import { MarkdownPipe } from "../../../../../shared/pipes/markdown/markdown";
import { httpUrl, patchGroups } from "@common/quests/story-template";
import type { PatchOverview, StoryTableRow } from "@lib/types/story-template.type";
import { storyCompletionKey, storyRowDone, storyTrackingMode } from "@common/quests/story-guide";
import type { StoryContext } from "@lib/types/story-context.type";
import { StoryTrackingMode } from "@lib/enums/story-tracking.enum";
import { NgTemplateOutlet } from '@angular/common';
import { worldQuestGroups, worldQuestObjectives, worldQuestPrerequisites } from "@common/quests/world-quest";
import type { WorldQuestSection } from "@lib/types/world-quest.type";
import { WORLD_QUEST_SUBTYPES, WORLD_QUEST_GROUP_TYPES } from "@lib/constants/world-quest.constants";
import { PatchBadge } from "../../../shared/components/patch-badge/patch-badge";

@Component({
    selector: 'gg-story-content-list',
    imports: [MarkdownPipe, NgTemplateOutlet, PatchBadge],
    templateUrl: "./story-content-list.html",
    styleUrls: ['./patch-reading.scss', './patch-media.scss', './primary-quest-reading.scss', './world-quest-reading.scss', './activity-subtype.scss'],
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
    readonly patchOverview = computed(() => this.entry().category === 'patch-overview');
    readonly characterProfile = computed(() => this.entry().category === 'character-information');
    readonly worldQuest = computed(() => this.entry().category === 'world-quests');
    readonly worldGroupName = (mode: string) => WORLD_QUEST_GROUP_TYPES.find(type => type.id === mode)?.label ?? 'Area Exploration';
    readonly worldGroups = computed(() => worldQuestGroups(this.data()));
    readonly visibleWorldGroups = computed(() => this.worldGroups().filter(group => group.sections.some(section => this.visibleSection(section))));
    readonly httpUrl = httpUrl;
    readonly done = (row: StoryTableRow) => storyRowDone(this.entry(), row);
    readonly canTrack = (row: StoryTableRow) => storyCompletionKey(this.entry(), row) !== null;
    readonly rows = computed(() => this.data().rows.filter(row => !row.rowType || row.rowType === 'quest'));
    readonly completed = computed(() => this.rows().filter(this.done).length);
    readonly reference = computed(() => ['patch-overview', 'lore', 'character-information'].includes(this.entry().category));
    readonly activity = computed(() => this.entry().category === 'endgame-activity');
    readonly eventTemplate = computed(() => this.entry().category === 'events');
    readonly questTemplate = computed(() => ['main-story', 'side-stories'].includes(this.entry().category));
    readonly sharedPatch = computed(() => {
        if (this.data().patchVersion) {return this.data().patchVersion!;}
        const versions = [...new Set(this.rows().map(row => row.patch).filter(Boolean))];
        return versions.length === 1 ? versions[0] : '';
    });
    readonly groups = computed(() => {
        const groups = patchGroups(this.data());
        if (!this.incompleteOnly()) {return groups;}
        return groups.map(group => ({ ...group, rows: group.rows.filter(row =>
            row.rowType === 'heading' || row.rowType === 'note' || !this.done(row),
        ) })).filter(group => group.rows.some(row => !row.rowType || row.rowType === 'quest'));
    });
    private readonly mediaWords = /\b(trailers?|teasers?|media|music|eps?|soundtracks?|ost|videos?|cutscenes?|cinematics?|songs?|demos?|concerts?)\b/i;
    mediaProvider(row: StoryTableRow): { name: string; kind: string } | null {
        const value = httpUrl(row.contentUrl || row.content);
        if (!value) {return null;}
        const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
        if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) {return { name: 'YouTube', kind: 'youtube' };}
        if (host === 'bilibili.com' || host.endsWith('.bilibili.com') || host === 'b23.tv') {return { name: 'Bilibili', kind: 'bilibili' };}
        if (['vimeo.com', 'player.vimeo.com', 'twitch.tv', 'm.twitch.tv'].includes(host)) {return { name: host.includes('vimeo') ? 'Vimeo' : 'Twitch', kind: 'video' };}
        return { name: host, kind: 'website' };
    }
    mediaGroup(group: ReturnType<typeof patchGroups>[number]): boolean {
        if (/\bpatch\s*notes?\b/i.test(group.title)) {return false;}
        const rows = group.rows.filter(row => !row.rowType || row.rowType === 'quest');
        return this.mediaWords.test(group.title) || !!rows.length && rows.every(row => !!row.thumbnailUrl || !!row.duration || ['youtube', 'bilibili', 'video'].includes(this.mediaProvider(row)?.kind ?? ''));
    }
    groupIcon(group: ReturnType<typeof patchGroups>[number]): string {
        return /\b(music|eps?|songs?|soundtracks?|ost)\b/i.test(group.title) ? 'music' : this.mediaGroup(group) ? 'play' : this.eventTemplate() ? 'event' : 'document';
    }
    mediaRow(row: StoryTableRow): boolean {
        if (row.rowType === 'heading' || row.rowType === 'note') {return false;}
        return ['youtube', 'bilibili', 'video'].includes(this.mediaProvider(row)?.kind ?? '') ||
            this.patchOverview() && (!!row.thumbnailUrl || !!row.duration || this.groups().some(group => this.mediaGroup(group) && group.rows.some(item => item.id === row.id)));
    }
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
        return (!this.incompleteOnly() || worldQuestObjectives(section.rows).some(row => !this.done(row))) &&
            section.rows.some(row => row.rowType === 'note' ? !!(row.notes.trim() || row.notesRight?.trim()) : row.rowType !== 'heading' || !!row.content.trim());
    }
    subtype(value?: string): string {
        return value ? WORLD_QUEST_SUBTYPES.get(value) ?? value : '';
    }
    worldNotes(row: StoryTableRow) {
        return this.contextNotes(row.context).filter(item => item.text.trim());
    }
    hasWorldNotes(row: StoryTableRow): boolean {return !!(row.notes.trim() || row.notesRight?.trim() || this.worldNotes(row).length);}
    visiblePrerequisites(context?: StoryContext) {
        return (worldQuestPrerequisites(context) ?? []).filter(item => item.text.trim() || this.requirementTarget(item.targetId));
    }
    contextNotes(context?: StoryContext) {
        return context?.requirements?.filter(item => !['prerequisite', 'unlock', 'time-gate'].includes(item.type)) ?? [];
    }
    private readonly requirementLinks = computed(() => storyRequirementLinks(this.relatedEntries(), this.entry().game));
    requirementTarget(id?: string) {return this.requirementLinks().find(link => link.id === id);}
    worldAnchor(row: StoryTableRow, groupId: string): string {
        const first = this.worldGroups().find(group => group.rows.some(item => item.id === row.id));
        return first?.id === groupId ? this.anchor(row) : `${this.anchor(row)}-membership-${groupId}`;
    }
    count(rows: StoryTableRow[]): number { return worldQuestObjectives(rows).filter(row => !this.eventTemplate() || !row.optional).length; }
    countDone(rows: StoryTableRow[]): number { return worldQuestObjectives(rows).filter(row => (!this.eventTemplate() || !row.optional) && this.done(row)).length; }
    groupProgress(id: string): { total: number; completed: number; percent: number } {
        const rows = patchGroups(this.data()).find(group => group.id === id)?.rows ?? [];
        return this.progressForRows(rows);
    }
    progressForRows(rows: StoryTableRow[]): { total: number; completed: number; percent: number } {
        const total = this.count(rows);
        const completed = this.countDone(rows);
        return { total, completed, percent: total ? Math.round(completed / total * 100) : 0 };
    }
    anchor(row: StoryTableRow): string { return `story-row-${this.entry().id}-${row.id}`; }
    contextText(context?: StoryContext): string {
        return [context?.region, context?.area, context?.chain, context?.difficulty].filter(Boolean).join(' · ');
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
        if (!(event instanceof CustomEvent) || ![...this.data().rows, ...(this.data().groups ?? []).flatMap(group => group.mainQuest ? [group.mainQuest] : [])].some(row => this.anchor(row) === event.detail)) {return;}
        this.collapsed.set([]);
        this.collapsedSections.set([]);
    }
}
