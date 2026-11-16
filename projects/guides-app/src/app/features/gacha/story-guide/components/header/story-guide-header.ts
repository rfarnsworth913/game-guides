import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, input, model, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import type { Entry } from '@lib/types/workspace.type';
import { storyImageUrl } from '@common/quests/story-template';
import type { StorySearchResult } from '../../utils/story-search';
import type { storyProgress } from '../../utils/story-progress';

@Component({
    selector: 'gg-story-guide-header',
    imports: [FormsModule, NgTemplateOutlet],
    templateUrl: './story-guide-header.html',
    styleUrls: ['./story-guide-header.scss', './story-guide-toolbar.scss', './story-guide-progress.scss'],
})
export class StoryGuideHeader {
    private readonly destroy = inject(DestroyRef);
    readonly gameName = input.required<string>();
    readonly updated = input('');
    readonly regions = input<Entry[]>([]);
    readonly region = input<Entry>();
    readonly subsectionCount = input(0);
    readonly progress = input<(ReturnType<typeof storyProgress> & { id: string; title: string })[]>([]);
    readonly categoryIcon = input<(id: string) => string>(() => '◇');
    readonly canEdit = input(false);
    readonly editing = input(false);
    readonly busy = input(false);
    readonly editorOpen = input(false);
    readonly resetting = input(false);
    readonly query = model('');
    readonly incompleteOnly = model(false);
    readonly statisticsExpanded = model(false);
    readonly searchResults = input<StorySearchResult[]>([]);
    readonly regionSelected = output<string>();
    readonly regionKey = output<KeyboardEvent>();
    readonly editToggled = output<void>();
    readonly addRegion = output<void>();
    readonly resetRequested = output<void>();
    readonly resultSelected = output<StorySearchResult>();
    readonly toolbarHeight = output<number>();
    readonly compact = signal(false);
    readonly mobileSearch = signal(false);
    readonly compactProgressExpanded = signal(false);
    readonly failedBackground = signal('');
    readonly background = computed(() => storyImageUrl(this.region()?.sectionImageUrl ?? ''));
    readonly overall = computed(() => this.progress()[0] ?? { total: 0, completed: 0, percent: 0 });
    readonly toolbar = viewChild<ElementRef<HTMLElement>>('toolbar');
    private readonly progressArea = viewChild<ElementRef<HTMLElement>>('progressArea');
    private readonly progressToggle = viewChild<ElementRef<HTMLButtonElement>>('progressToggle');
    private readonly expandedHeader = viewChild<ElementRef<HTMLElement>>('expandedHeader');
    private readonly regionId = computed(() => this.region()?.id);
    readonly imageUrl = storyImageUrl;

    constructor() {
        effect(() => {
            this.regionId();
            this.compact();
            this.editorOpen();
            this.compactProgressExpanded.set(false);
        });
        afterNextRender(() => {
            const expanded = this.expandedHeader()?.nativeElement;
            const toolbar = this.toolbar()?.nativeElement;
            if (expanded && typeof IntersectionObserver !== 'undefined') {
                const observer = new IntersectionObserver(([entry]) => {
                    if (entry) {this.compact.set(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);}
                });
                // Observe the entire header so a large mobile scroll cannot skip a tiny sentinel.
                observer.observe(expanded);
                this.destroy.onDestroy(() => observer.disconnect());
            }
            if (toolbar) {
                const measure = () => this.toolbarHeight.emit(Math.ceil(toolbar.getBoundingClientRect().height));
                measure();
                if (typeof ResizeObserver !== 'undefined') {
                    const observer = new ResizeObserver(measure);
                    observer.observe(toolbar);
                    this.destroy.onDestroy(() => observer.disconnect());
                }
            }
        });
    }

    @HostListener('document:pointerdown', ['$event'])
    @HostListener('document:focusin', ['$event'])
    closeProgressOutside(event: Event): void {
        if (event.target instanceof Node && !this.progressArea()?.nativeElement.contains(event.target)) {this.compactProgressExpanded.set(false);}
    }

    @HostListener('document:keydown.escape', ['$event'])
    closeProgressWithEscape(event: Event): void {
        if (!this.compactProgressExpanded()) {return;}
        this.compactProgressExpanded.set(false);
        if (event.target instanceof Node && this.progressArea()?.nativeElement.contains(event.target)) {
            event.stopPropagation();
            this.progressToggle()?.nativeElement.focus({ preventScroll: true });
        }
    }

    /** Only the compact toolbar obscures reading content; the artwork scrolls normally. */
    readingOffset(): number {
        return this.compact() ? Math.max(0, this.toolbar()?.nativeElement.getBoundingClientRect().bottom ?? 0) : 0;
    }
}
