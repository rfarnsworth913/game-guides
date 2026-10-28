import { afterNextRender, Component, DestroyRef, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

@Component({
    selector: 'gg-back-to-top',
    template: `
        <button type="button" class="back-to-top" [class.visible]="visible()"
            [attr.tabindex]="visible() ? 0 : -1" [attr.aria-hidden]="!visible()"
            aria-label="Back to top" title="Back to top" (click)="scrollToTop()">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m6 13 6-6 6 6M12 7v13M5 3h14" />
            </svg>
        </button>
    `,
    styleUrl: './back-to-top.scss',
})
export class BackToTop {
    private readonly window = inject(DOCUMENT).defaultView;
    private readonly destroyRef = inject(DestroyRef);
    readonly visible = signal(false);

    constructor() {
        afterNextRender(() => {
            const window = this.window;
            if (!window) return;
            const update = () => this.visible.set(window.scrollY > 300);
            update();
            window.addEventListener('scroll', update, { passive: true });
            this.destroyRef.onDestroy(() => window.removeEventListener('scroll', update));
        });
    }

    scrollToTop(): void {
        this.window?.scrollTo({
            top: 0,
            behavior: this.window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
    }
}
