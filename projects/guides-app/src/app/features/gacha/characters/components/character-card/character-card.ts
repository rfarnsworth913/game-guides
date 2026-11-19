import { Component, computed, effect, input, output, signal } from '@angular/core';
import type { CharacterCardViewModel } from '@lib/types/character-display.type';
import type { Entry } from '@lib/types/workspace.type';

@Component({
    selector: 'gg-character-card',
    templateUrl: './character-card.html',
    styleUrl: './character-card.scss',
    host: { '[class.list-view]': 'list()' },
})
export class CharacterCard {
    readonly character = input.required<CharacterCardViewModel>();
    readonly disabled = input(false);
    readonly canAdd = input(true);
    readonly list = input(false);
    readonly open = output<Entry>();
    readonly ownership = output<Entry>();
    readonly favorite = output<Entry>();
    private readonly failed = signal(false);
    private readonly source = computed(() => this.character().headshotUrl);
    readonly image = computed(() => this.failed() ? null : this.source());
    constructor() {effect(() => {this.source(); this.failed.set(false);});}
    imageLoaded(event: Event): void {
        const image = event.target as HTMLImageElement;
        if (image.naturalWidth && image.naturalHeight && (image.naturalWidth / image.naturalHeight < .8 || image.naturalWidth / image.naturalHeight > 1.25)) {this.failed.set(true);}
    }
    imageFailed(): void {this.failed.set(true);}
}
