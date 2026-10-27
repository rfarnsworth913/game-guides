import { Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from './auth.store';
import { WorkspaceStore } from './workspace.store';
@Component({
    selector: 'gg-account-menu',
    imports: [RouterLink],
    templateUrl: './account-menu.html',
    styleUrl: './account-menu.scss',
})
export class AccountMenu {
    readonly auth = inject(AuthStore);
    readonly store = inject(WorkspaceStore);
    readonly closeMenu = output<void>();
    readonly panel = signal<'main' | 'profile' | 'data'>('main');
    readonly initials = computed(() => accountInitials(this.auth.user()?.name));
    private readonly importDialog = viewChild.required<ElementRef<HTMLDialogElement>>('importDialog');
    reset(): void {
        this.panel.set('main');
        this.message.set('');
    }
    openImport(): void {
        this.preview();
        if (this.importCount() !== null) this.importDialog().nativeElement.showModal();
    }
    readonly importCount = signal<number | null>(null);
    readonly message = signal('');
    async logout(): Promise<void> {
        if (await this.auth.logout()) {
            this.store.clearAccountProgress();
            if (!this.auth.usesAuth0) window.location.reload();
        }
    }
    preview(): void {
        this.message.set('');
        try {
            const count = Object.keys(this.store.guestImport()).length;
            if (!count) {
                this.message.set('No matching browser progress to import.');
            } else {
                this.importCount.set(count);
            }
        } catch (error) {
            this.message.set(
                error instanceof Error ? error.message : 'Could not read browser progress.',
            );
        }
    }
    async confirmImport(): Promise<void> {
        if (await this.store.importGuestProgress()) {
            this.importCount.set(null);
            this.importDialog().nativeElement.close();
            this.message.set('Browser progress imported into your account.');
        }
    }
}

export function accountInitials(name?: string): string {
    return (name?.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('') || 'P').toUpperCase();
}
