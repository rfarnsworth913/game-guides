import { Component, computed, input, signal } from '@angular/core';
import { DashboardLoading } from './dashboard-loading';

@Component({ selector: 'gg-dashboard-artwork', imports: [DashboardLoading], template: `
    @if (src() && !failed()) {<img [src]="src()" alt="" loading="lazy" [class.loaded]="loaded()" (load)="settle('loaded')" (error)="settle('failed')" />}
    <div class="loading-layer" [class.visible]="loading()" [attr.aria-hidden]="!loading()"><gg-dashboard-loading label="Loading game banner" /></div>
`, styles: `
    :host {display:block;position:relative;overflow:hidden;background:var(--color-bg-tertiary)}
    img {position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 200ms ease} img.loaded{opacity:1}
    .loading-layer {position:absolute;inset:0;display:grid;place-items:center;opacity:0;visibility:hidden;pointer-events:none;transition:opacity 180ms ease,visibility 0s 180ms}
    .loading-layer.visible {opacity:1;visibility:visible;transition:opacity 180ms ease}
    @media(prefers-reduced-motion:reduce){img,.loading-layer{transition:none}}
` })
export class DashboardArtwork {
    readonly src = input('');
    private readonly state = signal({ src: '', status: '' });
    readonly loaded = computed(() => this.state().src === this.src() && this.state().status === 'loaded');
    readonly failed = computed(() => this.state().src === this.src() && this.state().status === 'failed');
    readonly loading = computed(() => !!this.src() && !this.loaded() && !this.failed());
    settle(status: 'loaded' | 'failed'): void {this.state.set({ src: this.src(), status });}
}
