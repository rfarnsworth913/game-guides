import { Component, computed, input } from '@angular/core';

@Component({
    selector: 'gg-patch-badge',
    template: '<span class="guide-patch-badge" [title]="label()">{{ label() }}</span>',
    styles: `
        :host { display: inline-flex; max-width: 100%; vertical-align: middle; }
        .guide-patch-badge {
            display: inline-flex; align-items: center; box-sizing: border-box;
            padding: 2px 8px; border-radius: 999px;
            border: 1px solid var(--guide-border, var(--color-border, #303b4c));
            background: var(--guide-nested, var(--color-bg-tertiary, #202938));
            color: var(--guide-text, var(--color-text-primary, #f1f5f9));
            font-size: 11px; font-weight: 600; line-height: 1.4;
            font-variant-numeric: tabular-nums; white-space: nowrap;
        }
    `,
})
export class PatchBadge {
    readonly version = input<string | undefined>();
    readonly label = computed(() => this.version()?.trim() ? 'Patch ' + this.version()!.trim() : 'Patch unknown');
}
