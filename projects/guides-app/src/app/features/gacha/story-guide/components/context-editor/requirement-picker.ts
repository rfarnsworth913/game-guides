import { Component, computed, ElementRef, HostListener, inject, input, model, signal, viewChild } from '@angular/core';
import type { Entry } from '../../../../../core/state/workspace.store';
import { storyRequirementLinks, type RequirementLink } from '../../utils/story-requirement-links';

@Component({
    selector: 'gg-requirement-picker',
    templateUrl: './requirement-picker.html',
    styleUrl: './requirement-picker.scss',
})
export class RequirementPicker {
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
    readonly game = input('');
    readonly entries = input<Entry[]>([]);
    readonly value = model('');
    readonly open = signal(false);
    readonly query = signal('');
    readonly active = signal(0);
    readonly listId = 'requirements-' + crypto.randomUUID();
    readonly links = computed(() => storyRequirementLinks(this.entries(), this.game()));
    readonly selected = computed(() => this.links().find(link => link.id === this.value()));
    readonly matches = computed(() => {
        const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
        const words = normalize(this.query()).trim().split(/\s+/).filter(Boolean);
        return this.links().filter(link => words.every(word => normalize(`${link.name} ${link.detail}`).includes(word))).slice(0, 20);
    });
    search(event: Event): void {
        this.query.set((event.target as HTMLInputElement).value);
        this.active.set(0);
        this.open.set(true);
    }
    choose(link: RequirementLink): void {
        this.value.set(link.id);
        this.searchInput()?.nativeElement.focus();
        this.close();
    }
    clear(): void {this.value.set(''); this.close();}
    close(): void {this.open.set(false); this.query.set(''); this.active.set(0);}
    keydown(event: KeyboardEvent): void {
        if (event.key === 'Escape' && this.open()) {event.preventDefault(); event.stopPropagation(); this.close();}
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            const offset = this.open() ? (event.key === 'ArrowDown' ? 1 : -1) : 0;
            this.active.set(Math.max(0, Math.min(this.matches().length - 1, this.active() + offset)));
            this.open.set(true);
            this.host.nativeElement.querySelector(`#${this.listId}-${this.active()}`)?.scrollIntoView?.({ block: 'nearest' });
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            const link = this.open() ? this.matches()[this.active()] : null;
            if (link) {this.choose(link);}
        }
    }
    @HostListener('document:pointerdown', ['$event'])
    outside(event: PointerEvent): void {
        if (event.target instanceof Node && !this.host.nativeElement.contains(event.target)) {this.close();}
    }
    @HostListener('focusout', ['$event'])
    blur(event: FocusEvent): void {
        if (!(event.relatedTarget instanceof Node) || !this.host.nativeElement.contains(event.relatedTarget)) {this.close();}
    }
}
