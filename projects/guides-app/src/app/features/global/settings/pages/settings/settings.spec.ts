import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SettingsPage } from './settings';
import { WorkspaceStore } from '../../../../../core/state/workspace.store';
import { ThemeService } from '../../../../../core/theme/theme.service';

describe('Settings feature', () => {
    it('preserves the data tab and backup import notification', async () => {
        const store = { entries: signal([]), replace: vi.fn(async () => true), restoreTeams: vi.fn(async () => true) };
        TestBed.configureTestingModule({ providers: [
            { provide: WorkspaceStore, useValue: store },
            { provide: ThemeService, useValue: { preference: signal('dark'), setPreference: vi.fn() } },
        ] });
        const fixture = TestBed.createComponent(SettingsPage);
        fixture.componentRef.setInput('settingsTab', 'data');
        fixture.detectChanges();
        const root = (fixture.nativeElement as HTMLElement) as HTMLElement;
        expect(root.querySelector('select')).toBeNull();
        expect(root.textContent).toContain('Export JSON backup');
        let notice = '';
        fixture.componentInstance.notice.subscribe(value => { notice = value; });
        const input = { files: [{ size: 32, text: async () => JSON.stringify({ version: 1, entries: [] }) }], value: 'backup.json' };
        await fixture.componentInstance.importData({ target: input } as unknown as Event);
        expect(store.replace).toHaveBeenCalledTimes(1);
        expect(notice).toBe('Backup imported. Matching entries were updated.');
        expect(input.value).toBe('');
    });
});
