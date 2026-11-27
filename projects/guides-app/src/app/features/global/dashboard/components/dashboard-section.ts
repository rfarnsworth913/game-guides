import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardLoading } from './dashboard-loading';

@Component({ selector: 'gg-dashboard-section', imports: [RouterLink, DashboardLoading], templateUrl: './dashboard-section.html', styles: `
    :host {display:block;min-width:0} section {border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:20px}
    header {display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
    h2 {font-size:19px;line-height:1.35;margin:0} h2 span {font-size:13px;color:var(--muted);font-weight:400;margin-left:6px}
    h2 {display:flex;align-items:center;gap:9px} h2 svg {width:21px;height:21px;flex-shrink:0;fill:none;stroke:var(--category-color,currentColor);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
    header:has(svg) {background:linear-gradient(270deg,color-mix(in srgb,var(--category-color,var(--color-info)) 8%,transparent),transparent 65%);padding-bottom:10px;border-bottom:1px solid var(--line)}
    header a {font-size:13px;color:var(--color-info);text-decoration:none;white-space:nowrap}
    .description {font-size:13px;color:var(--muted);margin:-5px 0 14px}
    .section-content {position:relative} .section-content.is-loading {min-height:64px}
    .section-body {opacity:1;transition:opacity 200ms ease} .is-loading .section-body {opacity:0;pointer-events:none}
    .loading-layer {position:absolute;inset:0;display:grid;place-items:center;opacity:0;visibility:hidden;pointer-events:none;transition:opacity 180ms ease,visibility 0s 180ms}
    .loading-layer.visible {opacity:1;visibility:visible;transition:opacity 180ms ease}
    @media(prefers-reduced-motion:reduce){.section-body,.loading-layer{transition:none}}
    @media (min-width:1100px) and (min-height:700px) {
        section {padding:14px 16px} header {margin-bottom:10px} h2 {font-size:17px}
        :host(.events-panel),:host(.ending-soon) {display:flex;flex:0 1 auto;min-height:0}
        :host(.ending-soon) {flex:0 1 auto;max-height:42%}
        :host(.events-panel) section,:host(.ending-soon) section {display:flex;flex:1;flex-direction:column;min-height:0;overflow:hidden}
        :host(.events-panel) header,:host(.ending-soon) header,:host(.ending-soon) .description {flex-shrink:0}
        :host(.events-panel) .section-content,:host(.ending-soon) .section-content {overflow:auto;min-height:0;scrollbar-gutter:stable}
    }
` })
export class DashboardSection {
    readonly title = input.required<string>(); readonly count = input<number>(); readonly description = input('');
    readonly link = input(''); readonly action = input('View all'); readonly loading = input(false);
    readonly query = input<Record<string, string> | null>(null);
    readonly icon = input('');
}
