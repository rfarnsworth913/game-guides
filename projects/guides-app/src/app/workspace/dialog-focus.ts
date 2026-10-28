import {
    AfterViewInit,
    Directive,
    ElementRef,
    HostListener,
    OnDestroy,
    inject,
} from '@angular/core';

/** Contains keyboard focus in a modal and returns it to its trigger on close. */
@Directive({ selector: '[ggDialogFocus]' })
export class DialogFocusDirective implements AfterViewInit, OnDestroy {
    private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly previous = document.activeElement as HTMLElement | null;
    ngAfterViewInit(): void {
        queueMicrotask(() => this.controls()[0]?.focus());
    }
    ngOnDestroy(): void {
        this.previous?.focus();
    }
    private controls(): HTMLElement[] {
        return [
            ...this.element.nativeElement.querySelectorAll<HTMLElement>(
                'button, input, select, textarea, a[href]',
            ),
        ].filter((e) => !e.hasAttribute('disabled') && e.offsetParent !== null);
    }
    @HostListener('keydown', ['$event'])
    trap(event: KeyboardEvent): void {
        if (event.key !== 'Tab') {
            return;
        }
        const controls = this.controls();
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
        }
    }
}
