import { storyContentTypes } from '../../../../common/story-content-types';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { DialogFocusDirective } from './dialog-focus';
import { Entry, WorkspaceStore } from './workspace.store';
import { PatchOverviewTemplate } from './patch-overview';
import { WorldQuestsTemplate } from './world-quests';
import { storyProgress } from './story-progress';
import {
    emptyPatchOverview,
    validPatchOverview,
    trimPatchOverviewText,
    preparePatchGroups,
} from '../../../../common/story-template';

@Component({
    selector: 'gg-story',
    imports: [FormsModule, NgTemplateOutlet, DialogFocusDirective, PatchOverviewTemplate, WorldQuestsTemplate],
    templateUrl: './story.html',
    styleUrl: './story.scss',
})
export class Story {
    readonly game = input.required<string>();
    readonly store = inject(WorkspaceStore);
    readonly selected = signal('');
    readonly editMode = signal(false);
    readonly activeOutline = signal('');
    readonly encodeAnchor = (id: string) => '#' + encodeURIComponent(id);
    hasTemplate(entry: Entry): boolean {
        return ['patch-overview', 'main-story', 'side-stories', 'world-quests'].includes(entry.category);
    }
    attachedQuests(entry: Entry): Entry[] {
        if (this.editMode() || !['main-story', 'side-stories', 'patch-overview'].includes(entry.category)) return [];
        const entries = this.subsections();
        const attached: Entry[] = [];
        for (let i = entries.indexOf(entry) + 1; i < entries.length && entries[i].category === 'world-quests'; i++) attached.push(entries[i]);
        return attached;
    }
    displayedSubsections(): Entry[] {
        const entries = this.subsections();
        const attached = new Set(entries.flatMap((entry) => this.attachedQuests(entry)).map((entry) => entry.id));
        return entries.filter((entry) => !attached.has(entry.id));
    }

    jumpTo(event: Event, id: string): void {
        const target = document.getElementById(id);
        if (!target) return;
        event.preventDefault();
        this.activeOutline.set(id);
        target.scrollIntoView({
            block: 'start',
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'instant'
                : 'smooth',
        });
        target.focus({ preventScroll: true });
    }
    readonly topics = computed(() => storyContentTypes(this.game()));
    readonly sections = computed(() =>
        this.store
            .entries()
            .filter((entry) => entry.game === this.game() && entry.kind === 'story-category')
            .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    );
    readonly active = computed<Entry | undefined>(
        () =>
            this.sections().find((section) => section.id === this.selected()) ?? this.sections()[0],
    );
    readonly subsections = computed(() =>
        this.store
            .entries()
            .filter(
                (entry) =>
                    entry.game === this.game() &&
                    entry.kind === 'story' &&
                    entry.storySection === this.active()?.id,
            )
            .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    );
    readonly busy = computed(
        () => !this.store.initialized() || this.store.loading() || this.store.saving(),
    );
    readonly progressCircles = computed(() => {
        const entries = this.subsections();
        return [
            { id: 'overall', title: 'Overall', ...storyProgress(entries) },
            ...this.topics().filter((topic) => entries.some((entry) => entry.category === topic.id))
                .map((topic) => ({ ...topic, ...storyProgress(entries.filter((entry) => entry.category === topic.id)) })),
        ];
    });
    editor: Entry | null = null;
    deleting: Entry | null = null;
    error = '';

    constructor() {
        effect(() => {
            this.game();
            this.selected.set('');
            this.editMode.set(false);
            this.editor = null;
            this.deleting = null;
        });
    }

    toggleEditMode(): void {
        if (this.busy() || this.editor || this.deleting) return;
        this.editMode.update((value) => !value);
    }

    topic(entry: Entry) {
        return this.topics().find((topic) => topic.id === entry.category) ?? this.topics()[1];
    }
    iconUrl(icon: string): string | null {
        try {
            const url = new URL(icon);
            return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
        } catch {
            return null;
        }
    }
    open(kind: 'story' | 'story-category', entry?: Entry): void {
        if (!this.editMode() || this.busy()) return;
        this.error = '';
        const siblings = kind === 'story' ? this.subsections() : this.sections();
        this.editor = entry
            ? structuredClone(entry)
            : {
                  id: crypto.randomUUID(),
                  game: this.game(),
                  kind,
                  name: '',
                  icon: '',
                  notes: '',
                  category: kind === 'story' ? 'main-story' : '',
                  ...(kind === 'story' ? { storySection: this.active()?.id } : {}),
                  order: siblings.length ? Math.max(...siblings.map((item) => item.order)) + 1 : 0,
                  quantity: 0,
                  target: 0,
                  rarity: 1,
                  members: [],
                  requirements: [],
                  completed: false,
                  day: '',
              };
        this.setTopic(this.editor, this.editor.category);
    }
    setTopic(entry: Entry, topic: string): void {
        entry.category = topic;
        if (topic === 'world-quests') {
            entry.worldQuests ??= emptyPatchOverview();
        }
        if (topic === 'side-stories') {
            entry.sideStories ??= emptyPatchOverview();
            preparePatchGroups(entry.sideStories);
        }
        if (topic === 'main-story') {
            entry.mainStory ??= emptyPatchOverview();
            preparePatchGroups(entry.mainStory);
        }
        if (topic === 'patch-overview') {
            entry.patchOverview ??= emptyPatchOverview();
            preparePatchGroups(entry.patchOverview);
        }
    }
    async save(): Promise<void> {
        const entry = this.editor;
        if (!entry || !this.editMode() || this.busy()) return;
        entry.name = entry.name.trim();
        entry.notes = entry.notes.trim();
        if (entry.icon !== undefined) entry.icon = entry.icon.trim();
        if (entry.patchOverview) trimPatchOverviewText(entry.patchOverview);
        if (entry.mainStory) trimPatchOverviewText(entry.mainStory);
        if (entry.worldQuests) trimPatchOverviewText(entry.worldQuests);
        if (entry.sideStories) trimPatchOverviewText(entry.sideStories);
        if (!validPatchOverview(entry.sideStories) || !validPatchOverview(entry.worldQuests) || !validPatchOverview(entry.patchOverview) || !validPatchOverview(entry.mainStory)) {
            this.error =
                'Check the content template: give each group a name, select uploaded images or use HTTP(S) image URLs, and use HTTP(S) source and content links.';
            return;
        }
        if (!entry.name.trim() || !Number.isSafeInteger(entry.order) || entry.order < 0) {
            this.error = 'Enter a title and a non-negative integer order.';
            return;
        }
        if (
            entry.kind === 'story' &&
            !this.sections().some((section) => section.id === entry.storySection)
        ) {
            this.error = 'Choose a navigation category.';
            return;
        }
        if (await this.store.save({ ...entry, name: entry.name.trim() })) {
            this.selected.set(entry.kind === 'story-category' ? entry.id : entry.storySection!);
            this.editor = null;
        } else this.error = this.store.error();
    }
    async remove(): Promise<void> {
        if (
            this.editMode() &&
            this.deleting &&
            !this.busy() &&
            (await this.store.remove(this.deleting.id))
        )
            this.deleting = null;
    }
    async toggle(entry: Entry): Promise<void> {
        await this.store.save({ ...entry, completed: !entry.completed });
    }
    async move(direction: number): Promise<void> {
        const sections = [...this.sections()];
        const index = sections.findIndex((section) => section.id === this.active()?.id);
        const target = index + direction;
        if (!this.editMode() || this.busy() || index < 0 || target < 0 || target >= sections.length)
            return;
        [sections[index], sections[target]] = [sections[target], sections[index]];
        const updates = new Map(
            sections.map((section, order) => [section.id, { ...section, order }]),
        );
        await this.store.replace(
            this.store.entries().map((entry) => updates.get(entry.id) ?? entry),
        );
    }
    navigateTabs(event: KeyboardEvent): void {
        const sections = this.sections();
        const index = sections.findIndex((section) => section.id === this.active()?.id);
        let target: number;
        switch (event.key) {
            case 'ArrowRight':
                target = (index + 1) % sections.length;
                break;
            case 'ArrowLeft':
                target = (index - 1 + sections.length) % sections.length;
                break;
            case 'Home':
                target = 0;
                break;
            case 'End':
                target = sections.length - 1;
                break;
            default:
                return;
        }
        event.preventDefault();
        this.selected.set(sections[target].id);
        (event.currentTarget as HTMLElement)
            .querySelectorAll<HTMLButtonElement>('[role="tab"]')
            [target]?.focus();
    }
}
