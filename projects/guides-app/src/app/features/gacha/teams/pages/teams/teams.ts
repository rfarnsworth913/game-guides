import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { WorkspaceStore } from "../../../../../core/state/workspace.store";
import { DialogFocusDirective } from "../../../../../shared/directives/dialog-focus";
import type { Team } from "../../../../../../../../lib/types/team.type";
import { teamSize, validTeams } from "../../../../../../../../common/player/teams";
import { storyImageUrl } from "../../../../../../../../common/quests/story-template";

@Component({
    selector: 'gg-teams',
    imports: [FormsModule, RouterLink, DialogFocusDirective],
    templateUrl: "./teams.html",
    styleUrl: "./teams.scss",
})
export class Teams {
    readonly game = input.required<string>();
    readonly store = inject(WorkspaceStore);
    readonly search = signal('');
    readonly characterSearch = signal('');
    readonly limit = computed(() => teamSize(this.store.characterRules()[this.game()]));
    readonly teams = computed(() => this.store.teams()[this.game()] ?? []);
    readonly characters = computed(() =>
        this.store
            .entries()
            .filter((entry) => entry.game === this.game() && entry.kind === 'characters'),
    );
    readonly collection = computed(() =>
        this.characters()
            .filter((entry) => entry.characterCollection?.owned)
            .sort((a, b) => a.name.localeCompare(b.name)),
    );
    readonly choices = computed(() =>
        this.collection().filter((entry) =>
            entry.name.toLowerCase().includes(this.characterSearch().trim().toLowerCase()),
        ),
    );
    readonly visible = computed(() =>
        this.teams().filter((team) =>
            [team.name, ...team.members.map((id) => this.character(id)?.name ?? '')]
                .join(' ')
                .toLowerCase()
                .includes(this.search().trim().toLowerCase()),
        ),
    );
    readonly busy = computed(
        () => this.store.saving() || this.store.loading() || !this.store.initialized(),
    );
    readonly validImage = storyImageUrl;
    readonly message = signal('');
    draft: Team | null = null;
    removing: Team | null = null;
    error = '';
    constructor() {
        effect(() => {
            this.game();
            this.draft = null;
            this.removing = null;
            this.error = '';
            this.search.set('');
            this.message.set('');
        });
    }
    character(id: string) {
        return this.characters().find((entry) => entry.id === id);
    }
    slots(team: Team): (string | null)[] {
        return Array.from(
            { length: Math.max(this.limit(), team.members.length) },
            (_, index) => team.members[index] ?? null,
        );
    }
    unavailable(): string[] {
        return (
            this.draft?.members.filter(
                (id) => !this.collection().some((entry) => entry.id === id),
            ) ?? []
        );
    }
    edit(team?: Team): void {
        this.error = '';
        this.characterSearch.set('');
        this.draft = team
            ? structuredClone(team)
            : { id: crypto.randomUUID(), name: '', notes: '', members: [] };
    }
    toggle(id: string): void {
        if (!this.draft || this.busy()) {return;}
        if (this.draft.members.includes(id))
            {this.draft.members = this.draft.members.filter((member) => member !== id);}
        else if (
            this.draft.members.length < this.limit() &&
            this.collection().some((entry) => entry.id === id)
        )
            {this.draft.members.push(id);}
    }
    close(): void {
        if (!this.busy()) {
            this.draft = null;
            this.removing = null;
            this.error = '';
        }
    }
    async save(): Promise<void> {
        if (!this.draft || this.busy()) {return;}
        const team = {
            ...structuredClone(this.draft),
            name: this.draft.name.trim(),
            notes: this.draft.notes.trim(),
        };
        if (
            !validTeams([team]) ||
            team.members.length > this.limit() ||
            this.unavailable().length
        ) {
            this.error = `Enter a team name and choose 1–${this.limit()} characters from your collection.`;
            return;
        }
        if (await this.store.saveTeam(this.game(), team)) {
            this.draft = null;
            this.message.set('Team saved.');
        } else {this.error = this.store.error() || 'Could not save the team. Please retry.';}
    }
    async remove(): Promise<void> {
        if (!this.removing || this.busy()) {return;}
        if (await this.store.deleteTeam(this.game(), this.removing.id)) {
            this.removing = null;
            this.message.set('Team deleted. Your character collection is unchanged.');
        } else {this.error = this.store.error() || 'Could not delete the team. Please retry.';}
    }
}
