import { Component, computed, input } from '@angular/core';
import type { DashboardProgress as Progress } from '@lib/types/dashboard.type';

@Component({ selector: 'gg-dashboard-progress', template: `
    @if (value().total > 0) {
        <div class="progress-copy"><span>{{ value().completed }} / {{ value().total }} {{ label() }}</span><strong>{{ percent() }}%</strong></div>
        <div class="progress-track" role="progressbar" [attr.aria-label]="label()" [attr.aria-valuenow]="value().completed" [attr.aria-valuemax]="value().total" aria-valuemin="0"><i [style.width.%]="percent()"></i></div>
    } @else {<small>No {{ label() }} yet</small>}
`, styles: `:host{display:block} .progress-copy{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--muted);margin-bottom:8px} strong{color:var(--color-text-primary)} .progress-track{height:5px;background:var(--line);border-radius:10px;overflow:hidden} i{display:block;height:100%;background:var(--game-accent,var(--color-primary));border-radius:inherit} small{color:var(--muted)}` })
export class DashboardProgress {
    readonly value = input.required<Progress>(); readonly label = input('items complete');
    readonly percent = computed(() => this.value().total ? Math.round(this.value().completed / this.value().total * 100) : 0);
}
