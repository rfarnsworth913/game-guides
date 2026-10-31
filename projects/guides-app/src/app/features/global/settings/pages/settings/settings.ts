import { Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WorkspaceStore } from '../../../../../core/state/workspace.store';
import { ThemeService } from '../../../../../core/theme/theme.service';
import { parseBackup } from '../../../../../../../../common/workspace/workspace';

@Component({ selector: 'gg-settings', imports: [FormsModule], templateUrl: './settings.html', styles: [':host { display: block; }'] })
export class SettingsPage {
    readonly store = inject(WorkspaceStore);
    readonly theme = inject(ThemeService);
    readonly settingsTab = input<string | null>();
    readonly notice = output<string>();
    exportData(): void {
        const url = URL.createObjectURL(
            new Blob([JSON.stringify({ version: 1, entries: this.store.entries(), characterRules: this.store.characterRules(), personalTeams: this.store.teams() }, null, 2)], {
                type: 'application/json',
            }),
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = 'game-guides-backup.json';
        a.click();
        URL.revokeObjectURL(url);
    }
    async importData(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }
        try {
            if (file.size > 5000000) {
                throw new Error();
            }
            const raw = await file.text();
            const entries = parseBackup(raw);
            const rules = JSON.parse(raw).characterRules;
            const merged = new Map(this.store.entries().map((e) => [e.id, e]));
            entries.forEach((e) => merged.set(e.id, e));
            if (await this.store.replace([...merged.values()], rules)) {
                const teams = JSON.parse(raw).personalTeams;
                if (teams && !await this.store.restoreTeams(teams)) {
                    this.notice.emit('Entries imported, but teams could not be restored: ' + this.store.error());
                    return;
                }
                this.notice.emit('Backup imported. Matching entries were updated.');
            }
        } catch {
            this.notice.emit(
                'Invalid backup. Choose a Game Guides JSON export (maximum 5 MB). Nothing was changed.',
            );
        }
        input.value = '';
    }
}
