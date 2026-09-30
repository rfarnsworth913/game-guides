import { Component, computed, HostListener, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogFocusDirective } from './dialog-focus';
import { Entry, WorkspaceStore } from './workspace.store';

@Component({
    selector: 'gg-achievements',
    imports: [FormsModule, DialogFocusDirective, NgTemplateOutlet],
    templateUrl: './achievements.html',
})
export class Achievements {
    readonly game = input.required<string>();
    readonly store = inject(WorkspaceStore);
    readonly categories = computed(() =>
        this.store
            .entries()
            .filter((e) => e.game === this.game() && e.kind === 'achievement-category')
            .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    );
    readonly search = signal('');
    readonly collapsed = signal<string[]>([]);
    readonly visibleCategories = computed(() =>
        this.categories().filter(
            (category) => !this.search().trim() || this.filteredAchievements(category).length > 0,
        ),
    );
    setSearch(value: string): void {
        this.search.set(value);
        if (value.trim()) {
            this.collapsed.set([]);
        }
    }
    toggleCategory(id: string): void {
        this.collapsed.update((ids) =>
            ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
        );
    }
    filteredAchievements(category: Entry): Entry[] {
        const query = this.search().trim().toLocaleLowerCase();
        return this.achievements(category.id).filter((achievement) =>
            [
                category.name,
                achievement.name,
                achievement.description,
                achievement.requirementText,
                achievement.reward,
            ].some((value) => value?.toLocaleLowerCase().includes(query)),
        );
    }
    editor: Entry | null = null;
    deleting: Entry | null = null;
    error = '';
    readonly dragId = signal('');
    readonly dropId = signal('');
    readonly moveNotice = signal('');
    private drag: { entry: Entry; x: number; y: number; pointer: number } | null = null;

    startDrag(event: PointerEvent, entry: Entry): void {
        if (event.button !== 0) {
            return;
        }
        const handle = event.currentTarget as HTMLElement;
        handle.setPointerCapture(event.pointerId);
        this.drag = { entry, x: event.clientX, y: event.clientY, pointer: event.pointerId };
        this.moveNotice.set('');
    }
    private dropTarget(event: PointerEvent): HTMLElement | null {
        const element = document.elementFromPoint(event.clientX, event.clientY);
        return (
            element?.closest<HTMLElement>(
                this.drag?.entry.kind === 'achievement-category'
                    ? '[data-category-id]'
                    : '[data-achievement-id], [data-category-id]',
            ) ?? null
        );
    }
    @HostListener('document:pointermove', ['$event'])
    dragMove(event: PointerEvent): void {
        if (!this.drag || event.pointerId !== this.drag.pointer) {
            return;
        }
        if (
            Math.hypot(event.clientX - this.drag.x, event.clientY - this.drag.y) < 6 &&
            !this.dragId()
        ) {
            return;
        }
        event.preventDefault();
        this.dragId.set(this.drag.entry.id);
        const target = this.dropTarget(event);
        this.dropId.set(
            target?.getAttribute('data-achievement-id') ??
                target?.getAttribute('data-category-id') ??
                '',
        );
        if (event.clientY < 55) {
            window.scrollBy(0, -20);
        }
        if (event.clientY > window.innerHeight - 55) {
            window.scrollBy(0, 20);
        }
    }
    @HostListener('document:pointerup', ['$event'])
    finishDrag(event: PointerEvent): void {
        if (!this.drag || event.pointerId !== this.drag.pointer) {
            return;
        }
        const source = this.drag.entry;
        const target = this.dragId() ? this.dropTarget(event) : null;
        if (target) {
            const categoryId =
                target.closest('[data-category-id]')?.getAttribute('data-category-id') ?? '';
            const targetId = target.getAttribute(
                source.kind === 'achievement-category' ? 'data-category-id' : 'data-achievement-id',
            );
            const siblings = (
                source.kind === 'achievement-category'
                    ? this.categories()
                    : this.achievements(categoryId)
            ).filter((e) => e.id !== source.id);
            if (targetId !== source.id) {
                const bounds = target.getBoundingClientRect();
                const after = event.clientY > bounds.top + bounds.height / 2;
                const index = siblings.findIndex((e) => e.id === targetId);
                const beforeId = index < 0 ? null : siblings[index + (after ? 1 : 0)]?.id ?? null;
                if (this.store.reorderAchievement(source.id, beforeId, categoryId)) {
                    this.moveNotice.set(`Moved ${source.name}.`);
                }
            }
        }
        this.cancelDrag();
    }
    @HostListener('document:pointercancel')
    @HostListener('document:keydown.escape')
    cancelDrag(): void {
        this.drag = null;
        this.dragId.set('');
        this.dropId.set('');
    }
    moveWithKeyboard(event: KeyboardEvent, entry: Entry): void {
        if (!['ArrowUp', 'ArrowDown'].includes(event.key)) {
            return;
        }
        event.preventDefault();
        const siblings =
            entry.kind === 'achievement-category'
                ? this.categories()
                : this.achievements(entry.category);
        const index = siblings.findIndex((e) => e.id === entry.id);
        const next = index + (event.key === 'ArrowUp' ? -1 : 1);
        if (next < 0 || next >= siblings.length) {
            return;
        }
        const beforeId =
            event.key === 'ArrowUp' ? siblings[next].id : siblings[next + 1]?.id ?? null;
        if (this.store.reorderAchievement(entry.id, beforeId)) {
            this.moveNotice.set(`Moved ${entry.name} to position ${next + 1}.`);
        }
    }

    achievements(category: string): Entry[] {
        return this.store
            .entries()
            .filter(
                (e) =>
                    e.game === this.game() && e.kind === 'achievements' && e.category === category,
            )
            .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    }
    completed(category: string): number {
        return this.achievements(category).filter((e) => e.completed).length;
    }
    progress(category: string): number {
        const count = this.achievements(category).length;
        return count ? (this.completed(category) / count) * 100 : 0;
    }
    wikiLink(url = ''): string | null {
        try {
            const parsed = new URL(url);
            return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : null;
        } catch {
            return null;
        }
    }
    readonly failedIcons = signal<string[]>([]);
    hideBrokenIcon(url: string): void {
        this.failedIcons.update((urls) => [...urls, url]);
    }
    open(category?: Entry, entry?: Entry): void {
        this.error = '';
        this.editor = entry
            ? structuredClone(entry)
            : {
                  id: crypto.randomUUID(),
                  game: this.game(),
                  kind: category ? 'achievements' : 'achievement-category',
                  name: '',
                  icon: '☆',
                  wikiUrl: '',
                  reward: '',
                  rewardIcon: '',
                  description: '',
                  requirementText: '',
                  category: category?.id ?? '',
                  completed: false,
                  notes: '',
                  quantity: 0,
                  target: 0,
                  rarity: 0,
                  order:
                      Math.max(
                          -1,
                          ...(category ? this.achievements(category.id) : this.categories()).map(
                              (e) => e.order,
                          ),
                      ) + 1,
                  day: 'Any day',
                  members: [],
                  requirements: [],
              };
    }
    save(): void {
        const entry = this.editor;
        if (!entry) {
            return;
        }
        entry.name = entry.name.trim();
        entry.wikiUrl = entry.wikiUrl?.trim() ?? '';
        entry.icon = entry.icon?.trim() || '☆';
        if (!entry.name) {
            this.error = 'Enter a title.';
            return;
        }
        if (entry.wikiUrl && !this.wikiLink(entry.wikiUrl)) {
            this.error = 'Enter a complete HTTP or HTTPS wiki URL.';
            return;
        }
        if (
            entry.kind === 'achievements' &&
            !this.categories().some((c) => c.id === entry.category)
        ) {
            this.error = 'Choose a category in this game.';
            return;
        }
        if (this.store.save(entry)) {
            this.editor = null;
        }
    }
    toggle(entry: Entry, event: Event): void {
        const checkbox = event.target as HTMLInputElement;
        if (!this.store.save({ ...entry, completed: checkbox.checked })) {
            checkbox.checked = entry.completed;
        }
    }
    remove(): void {
        if (this.deleting && this.store.remove(this.deleting.id)) {
            this.deleting = null;
        }
    }
}
