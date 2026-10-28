import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AccountMenu } from './account-menu';
import { AuthStore } from './auth.store';
import { WorkspaceStore } from './workspace.store';

describe('Account menu', () => {
    async function setup() {
        const auth = { user: signal({ name: 'Alice Zhang', editor: true }), error: signal('') };
        const store = {
            saving: signal(false), loading: signal(false),
            guestImport: vi.fn(() => ({ quest: { completed: true } })),
            importGuestProgress: vi.fn(async () => true),
        };
        await TestBed.configureTestingModule({
            imports: [AccountMenu],
            providers: [provideRouter([]), { provide: AuthStore, useValue: auth }, { provide: WorkspaceStore, useValue: store }],
        }).compileComponents();
        const fixture = TestBed.createComponent(AccountMenu);
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        return { fixture, root, store };
    }

    it('groups import under Data & backups and requires confirmation before merging', async () => {
        const { fixture, root, store } = await setup();
        const button = (text: string) => Array.from(root.querySelectorAll('button')).find(el => el.textContent?.includes(text))!;
        expect(root.querySelector('.account-avatar')?.textContent).toContain('AZ');
        expect(root.textContent).not.toContain('Import browser progress');
        button('Data & backups').click();
        fixture.detectChanges();
        const dialog = root.querySelector('dialog')!;
        dialog.showModal = vi.fn();
        dialog.close = vi.fn();
        button('Import browser progress').click();
        fixture.detectChanges();
        expect(dialog.showModal).toHaveBeenCalledOnce();
        expect(store.importGuestProgress).not.toHaveBeenCalled();
        button('Cancel').click();
        expect(dialog.close).toHaveBeenCalledOnce();
        expect(store.importGuestProgress).not.toHaveBeenCalled();
        button('Import browser progress').click();
        await fixture.componentInstance.confirmImport();
        expect(store.importGuestProgress).toHaveBeenCalledOnce();
        expect(dialog.close).toHaveBeenCalledTimes(2);
    });

    it('shows account access in profile and returns to the main menu on reopen', async () => {
        const { fixture, root } = await setup();
        Array.from(root.querySelectorAll('button')).find(el => el.textContent?.includes('My profile'))!.click();
        fixture.detectChanges();
        expect(root.querySelector('dd:last-child')?.textContent).toBe('Editor');
        fixture.componentInstance.reset();
        fixture.detectChanges();
        expect(root.querySelector('.sign-out')).not.toBeNull();
    });
});
