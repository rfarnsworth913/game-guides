import { Component, computed, input, output, signal } from '@angular/core';
import { FarmingMaterial } from '../../../../common/farming';
import { storyImageUrl } from '../../../../common/story-template';

@Component({
    selector: 'gg-farming-material',
    templateUrl: './farming-material.html',
    styleUrl: './farming-material.scss',
})
export class FarmingMaterialTile {
    readonly material = input.required<FarmingMaterial>();
    readonly interactive = input(true);
    readonly selected = output<FarmingMaterial>();
    readonly failed = signal('');
    readonly image = computed(() => {
        const icon = this.material().item.icon;
        if (!icon || this.failed() === icon) {return null;}
        return /^\/?(icons|images|assets)\/[\w/.,% -]+$/i.test(icon)
            ? '/' + icon.replace(/^\//, '')
            : storyImageUrl(icon);
    });
    label(): string {
        const row = this.material();
        return `${row.item.name}: ${row.owned} owned, ${row.required} required, ${row.missing} missing`;
    }
}
