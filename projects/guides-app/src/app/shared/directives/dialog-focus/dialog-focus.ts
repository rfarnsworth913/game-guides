import { AfterViewInit, DestroyRef, Directive, ElementRef, HostListener, inject } from "@angular/core";


/** Contains keyboard focus in a modal and returns it to its trigger on close. */
@Directive({
    selector: "[ggDialogFocus]"
})
export class DialogFocusDirective implements AfterViewInit {

    // Internal Properties ----------------------------------------------------
    private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly previous = document.activeElement as HTMLElement | null;

    private readonly destroyRef = inject<DestroyRef>(DestroyRef);


    // Angular Lifecycle Hooks ------------------------------------------------
    ngAfterViewInit (): void {
        queueMicrotask(() => this.controls()[0]?.focus());

        this.destroyRef.onDestroy(() => {
            this.previous?.focus();
        });
    }


    // Host Listeners ---------------------------------------------------------

    /**
     * Returns all focusable controls within the dialog.
     */
    private controls (): Array<HTMLElement> {
        return [
            ...this.element.nativeElement.querySelectorAll<HTMLElement>(
                "button, input, select, textarea, a[href]",
            ),
        ].filter(e => !e.hasAttribute("disabled") && e.offsetParent !== null);
    }

    /**
     * Traps the keyboard focus within the dialog when the Tab key is pressed.
     */
    @HostListener("keydown", ["$event"])
    trap (event: KeyboardEvent): void {

        if (event.key !== "Tab") {
            return;
        }

        const controls = this.controls();
        const [first] = controls;
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
