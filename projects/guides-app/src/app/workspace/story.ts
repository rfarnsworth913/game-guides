import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CharacterInformationTemplate } from './character-information';
import { storyContentTypes } from '../../../../common/story-content-types';
import { afterNextRender, Component, computed, effect, ElementRef, HostListener, inject, Injector, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { DialogFocusDirective } from './dialog-focus';
import { Entry, WorkspaceStore } from './workspace.store';
import { PatchOverviewTemplate } from './patch-overview';
import { WorldQuestsTemplate } from './world-quests';
import { LoreTemplate } from './lore';
import { storyProgress } from './story-progress';
import { GameImagePicker } from './game-image-picker';
import { searchStoryGuides, StorySearchResult } from './story-search';
import {
    emptyPatchOverview,
    validPatchOverview,
    trimPatchOverviewText,
    preparePatchGroups,
    storyImageUrl,
} from '../../../../common/story-template';

@Component({
    selector: 'gg-story',
    imports: [FormsModule, NgTemplateOutlet, DialogFocusDirective, PatchOverviewTemplate, WorldQuestsTemplate, LoreTemplate, CharacterInformationTemplate, GameImagePicker],
    templateUrl: './story.html',
    styleUrl: './story.scss',
})
export class Story {
    private readonly injector = inject(Injector);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    private readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
    private readonly routeParams = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
    readonly searchQuery = signal('');
    readonly searchResults = computed(() => searchStoryGuides(this.store.entries(), this.game(), this.searchQuery()));
    openSearchResult(result: StorySearchResult): void {
        this.selectSection(result.sectionId);
        this.searchQuery.set('');
        this.incompleteOnly.set(false);
        afterNextRender(() => {
            const target = document.getElementById(result.target);
            if (!target) return;
            target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
            target.focus({ preventScroll: true });
        }, { injector: this.injector });
    }
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly stickyHeader = viewChild<ElementRef<HTMLElement>>('stickyHeader');
    readonly game = input.required<string>();
    readonly store = inject(WorkspaceStore);
    readonly selected = signal('');
    readonly dragId = signal('');
    readonly dropId = signal('');
    readonly dropAfter = signal(false);
    readonly reorderNotice = signal('');
    private dragPointer: number | null = null;
    private dragHandle: HTMLElement | null = null;

    startReorder(event: PointerEvent, entry: Entry): void {
        if (event.button !== 0 || !this.editMode() || this.busy()) return;
        event.preventDefault();
        this.dragHandle = event.currentTarget as HTMLElement;
        this.dragPointer = event.pointerId;
        this.dragHandle.setPointerCapture(event.pointerId);
        this.dragId.set(entry.id);
        this.reorderNotice.set(`Reordering ${entry.name}. Drop on a header to move it. Escape cancels.`);
    }
    @HostListener('document:pointermove', ['$event'])
    moveReorder(event: PointerEvent): void {
        if (this.dragPointer !== event.pointerId || !this.dragId()) return;
        event.preventDefault();
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-story-entry]');
        const valid = target && this.host.nativeElement.contains(target);
        this.dropId.set(valid ? target.dataset['storyEntry'] ?? '' : '');
        if (valid) {
            const bounds = target.getBoundingClientRect();
            this.dropAfter.set(event.clientY > bounds.top + bounds.height / 2);
        }
        const headerBottom = this.stickyHeader()?.nativeElement.getBoundingClientRect().bottom ?? 0;
        if (event.clientY < headerBottom + 35) window.scrollBy(0, -20);
        else if (event.clientY > window.innerHeight - 45) window.scrollBy(0, 20);
    }
    @HostListener('document:pointerup', ['$event'])
    async finishReorder(event: PointerEvent): Promise<void> {
        if (this.dragPointer !== event.pointerId) return;
        const source = this.dragId();
        const target = this.dropId();
        try {
            if (source && target && source !== target) await this.reorderEntry(source, target, this.dropAfter());
        } finally { this.cancelReorder(); }
    }
    @HostListener('document:pointercancel')
    @HostListener('document:keydown.escape')
    cancelReorder(): void {
        if (this.dragPointer !== null && this.dragHandle?.hasPointerCapture(this.dragPointer)) {
            this.dragHandle.releasePointerCapture(this.dragPointer);
        }
        this.dragPointer = null;
        this.dragHandle = null;
        this.dragId.set('');
        this.dropId.set('');
    }
    async reorderEntry(source: string, target: string, after: boolean): Promise<void> {
        if (!this.editMode() || this.busy() || source === target) return;
        const entries = [...this.subsections()];
        const moved = entries.find((entry) => entry.id === source);
        if (!moved || !entries.some((entry) => entry.id === target)) return;
        const siblings = entries.filter((entry) => entry.id !== source);
        siblings.splice(siblings.findIndex((entry) => entry.id === target) + (after ? 1 : 0), 0, moved);
        const updates = new Map(siblings.map((entry, order) => [entry.id, { ...entry, order }]));
        if (await this.store.replace(this.store.entries().map((entry) => updates.get(entry.id) ?? entry))) {
            this.reorderNotice.set(`Moved ${moved.name} to position ${siblings.findIndex((entry) => entry.id === source) + 1}.`);
        } else this.reorderNotice.set(this.store.error() || 'Could not save the new order.');
    }
    async reorderWithKeyboard(event: KeyboardEvent, entry: Entry): Promise<void> {
        if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const entries = this.subsections();
        const direction = event.key === 'ArrowUp' ? -1 : 1;
        const target = entries[entries.indexOf(entry) + direction];
        if (target) await this.reorderEntry(entry.id, target.id, direction > 0);
    }
    readonly canEdit = computed(() => this.store.canEdit?.() ?? true);
    readonly editMode = signal(false);
    readonly incompleteOnly = signal(false);
    readonly showCategoryProgress = signal(false);
    readonly sectionImage = computed(() => {
        const image = storyImageUrl(this.active()?.sectionImageUrl ?? '');
        if (image) return image;
        const icon = storyImageUrl(this.active()?.icon ?? '');
        if (icon) return icon;
        for (const entry of this.subsections()) {
            const image = storyImageUrl((entry.patchOverview ?? entry.mainStory ?? entry.sideStories ?? entry.eventStory)?.imageUrl ?? '');
            if (image) return image;
        }
        return null;
    });
    topicIcon(id: string): string {
        return ({ 'patch-overview': '◉', 'main-story': '▤', 'side-stories': '♧', 'world-quests': '◇',
            events: '✦', lore: '◈', 'character-information': '▣' } as Record<string, string>)[id] ?? '◇';
    }
    readonly resetting = signal(false);
    confirmReset = false;
    showEntry(entry: Entry): boolean {
        if (!this.incompleteOnly() || this.editMode()) return true;
        const progress = storyProgress([entry]);
        return progress.completed < progress.total;
    }
    async resetProgress(): Promise<void> {
        if (!this.confirmReset || this.busy()) return;
        this.resetting.set(true);
        try {
            if (await this.store.resetStoryProgress(this.game())) this.confirmReset = false;
        } finally { this.resetting.set(false); }
    }
    readonly activeOutline = signal('');
    readonly encodeAnchor = (id: string) => '#' + encodeURIComponent(id);
    hasTemplate(entry: Entry): boolean {
        return ['patch-overview', 'main-story', 'side-stories', 'world-quests', 'lore', 'character-information', 'events'].includes(entry.category);
    }
    attachedQuests(entry: Entry): Entry[] {
        if (this.editMode() || !['main-story', 'side-stories', 'patch-overview', 'events'].includes(entry.category)) return [];
        const entries = this.subsections();
        const attached: Entry[] = [];
        for (let i = entries.indexOf(entry) + 1; i < entries.length && ['world-quests', 'lore', 'character-information'].includes(entries[i].category); i++) attached.push(entries[i]);
        return attached;
    }
    displayedSubsections(): Entry[] {
        const entries = this.subsections();
        const attached = new Set(entries.flatMap((entry) => this.attachedQuests(entry)).map((entry) => entry.id));
        return entries.filter((entry) => !attached.has(entry.id) &&
            (this.showEntry(entry) || this.attachedQuests(entry).some((quest) => this.showEntry(quest))));
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
    readonly sortedTopics = computed(() =>
        [...this.topics()].sort((a, b) => a.title.localeCompare(b.title)),
    );
    readonly sections = computed(() =>
        this.store
            .entries()
            .filter((entry) => entry.game === this.game() && entry.kind === 'story-category')
            .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    );
    readonly active = computed<Entry | undefined>(
        () =>
            this.sections().find((section) => this.routeParams().get('section')
                ? this.sectionSlug(section) === this.routeParams().get('section')
                : section.id === this.selected()) ?? this.sections()[0],
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
    isNewSubsection(): boolean {
        return this.editor?.kind === 'story' && !this.store.entries().some((entry) => entry.id === this.editor!.id);
    }
    validNewSubsection(): boolean {
        const entry = this.editor;
        return !!entry && !!entry.name.trim() && entry.name.length <= 200 &&
            this.topics().some((topic) => topic.id === entry.category) &&
            this.sections().some((section) => section.id === entry.storySection);
    }
    deleting: Entry | null = null;
    error = '';

    constructor() {
        effect((onCleanup) => {
            const header = this.stickyHeader()?.nativeElement;
            if (!header || typeof ResizeObserver === 'undefined') return;
            const update = () => this.host.nativeElement.style.setProperty('--story-sticky-height', `${header.getBoundingClientRect().height}px`);
            const observer = new ResizeObserver(update);
            observer.observe(header);
            update();
            onCleanup(() => observer.disconnect());
        });
        effect(() => {
            const game = this.game();
            const section = this.queryParams().get('section');
            try {
                this.selected.set(section ?? localStorage.getItem(`gg-story-tab-v1:${game}`) ?? '');
            } catch {
                this.selected.set(section ?? '');
            }
        });
        effect(() => {
            this.game();
            this.searchQuery.set('');
            this.cancelReorder();
            this.editMode.set(false);
            this.confirmReset = false;
            this.editor = null;
            this.deleting = null;
        });
    }

    sectionSlug(section: Entry): string {
        const slug = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
        const base = slug(section.name);
        return this.sections().filter((item) => slug(item.name) === base).length > 1
            ? `${base}-${section.id}` : base;
    }

    selectSection(id: string): void {
        const section = this.sections().find((section) => section.id === id);
        if (!section) return;
        void this.router.navigate(['/', this.game(), 'story', this.sectionSlug(section)], {
            queryParams: { section: null },
            queryParamsHandling: 'merge',
            preserveFragment: true,
        });
        this.selected.set(id);
        try {
            localStorage.setItem(`gg-story-tab-v1:${this.game()}`, id);
        } catch {
            // Navigation still works when browser storage is unavailable.
        }
    }

    toggleEditMode(): void {
        if (!this.canEdit() || this.busy() || this.editor || this.deleting) return;
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
        if (topic === 'character-information') {
            entry.characterInformation ??= emptyPatchOverview();
        }
        if (topic === 'lore') {
            entry.lore ??= emptyPatchOverview();
        }
        if (topic === 'world-quests') {
            entry.worldQuests ??= emptyPatchOverview();
        }
        if (topic === 'side-stories') {
            entry.sideStories ??= emptyPatchOverview();
            preparePatchGroups(entry.sideStories);
        }
        if (topic === 'events') {
            entry.eventStory ??= emptyPatchOverview();
            preparePatchGroups(entry.eventStory);
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
        if (this.isNewSubsection() && !this.validNewSubsection()) {
            this.error = 'Choose a content template and navigation category, and enter a section title.';
            return;
        }
        entry.name = entry.name.trim();
        entry.notes = entry.notes.trim();
        if (entry.icon !== undefined) entry.icon = entry.icon.trim();
        if (entry.sectionImageUrl !== undefined) {
            entry.sectionImageUrl = entry.sectionImageUrl.trim();
            if (entry.sectionImageUrl && !storyImageUrl(entry.sectionImageUrl)) {
                this.error = 'Choose an uploaded section image or enter an HTTP(S) image URL.';
                return;
            }
        }
        if (entry.patchOverview) trimPatchOverviewText(entry.patchOverview);
        if (entry.mainStory) trimPatchOverviewText(entry.mainStory);
        if (entry.worldQuests) trimPatchOverviewText(entry.worldQuests);
        if (entry.lore) trimPatchOverviewText(entry.lore);
        if (entry.sideStories) trimPatchOverviewText(entry.sideStories);
        if (entry.characterInformation) trimPatchOverviewText(entry.characterInformation);
        if (entry.eventStory) trimPatchOverviewText(entry.eventStory);
        if (!validPatchOverview(entry.lore) || !validPatchOverview(entry.eventStory) || !validPatchOverview(entry.characterInformation) || !validPatchOverview(entry.sideStories) || !validPatchOverview(entry.worldQuests) || !validPatchOverview(entry.patchOverview) || !validPatchOverview(entry.mainStory)) {
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
            this.selectSection(entry.kind === 'story-category' ? entry.id : entry.storySection!);
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
        this.selectSection(sections[target].id);
        (event.currentTarget as HTMLElement)
            .querySelectorAll<HTMLButtonElement>('[role="tab"]')
            [target]?.focus();
    }
}
