import { Component, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Entry } from '../../../../../../../../lib/types/workspace.type';
import { DashboardState } from '../../state/dashboard-state';

@Component({ selector: 'gg-dashboard', imports: [RouterLink], templateUrl: './dashboard.html', styleUrl: './dashboard.scss' })
export class DashboardPage extends DashboardState {
    readonly editPlan = output<Entry | undefined>();
    open(_kind: string, entry?: Entry): void { this.editPlan.emit(entry); }
}
