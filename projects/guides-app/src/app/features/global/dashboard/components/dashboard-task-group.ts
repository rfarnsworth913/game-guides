import { Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { GameRegistration } from '@lib/types/games.type';
import type { Entry } from '@lib/types/workspace.type';
import { eventType, eventTypeLabel } from '../../../gacha/events/utils/event-calendar';

@Component({ selector: 'gg-dashboard-task-group', imports: [RouterLink], templateUrl: './dashboard-task-group.html', styleUrl: './dashboard-task-group.scss' })
export class DashboardTaskGroup {
    readonly game = input.required<GameRegistration>();
    readonly entries = input.required<Entry[]>();
    readonly showHeader = input(true);
    readonly idSuffix = input('');
    readonly disabled = input(false);
    readonly collapsed = signal(false);
    readonly expanded = computed(() => !this.showHeader() || !this.collapsed());
    readonly completed = computed(() => this.entries().filter(entry => entry.completed).length);
    readonly completion = output<{ entry: Entry; checkbox: HTMLInputElement }>();
    typeLabel(entry: Entry): string {return eventTypeLabel(eventType(entry));}
    change(entry: Entry, checkbox: HTMLInputElement): void {checkbox.checked = entry.completed; this.completion.emit({ entry, checkbox });}
    hideImage(event: Event): void {if (event.target instanceof HTMLImageElement) {event.target.hidden = true;}}
}
