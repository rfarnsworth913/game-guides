import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Teams } from "./teams";
import { WorkspaceStore, Entry } from "../../../../../core/state/workspace.store";
import type { Team } from "../../../../../../../../lib/types/team.type";
import { emptyCharacterCollection } from "../../../../../../../../common/characters/characters";

const character: Entry = {
    id: 'one',
    game: 'genshin',
    kind: 'characters',
    name: 'One',
    category: '',
    notes: '',
    order: 0,
    day: '',
    members: [],
    requirements: [],
    rarity: 5,
    completed: false,
    quantity: 0,
    target: 0,
    characterCollection: emptyCharacterCollection(),
};
describe('Personal team builder', () => {
    async function setup() {
        const teams = signal<Record<string, Team[]>>({});
        const entries = signal([
            character,
            { ...character, id: 'two', name: 'Two' },
            {
                ...character,
                id: 'unowned',
                name: 'Unowned',
                characterCollection: { ...emptyCharacterCollection(), owned: false },
            },
            { ...character, id: 'other', game: 'hsr', name: 'Other game' },
        ]);
        const saveTeam = vi.fn(async (game: string, team: Team) => {
            teams.update((value) => ({
                ...value,
                [game]: [
                    ...(value[game] ?? []).filter((item) => item.id !== team.id),
                    structuredClone(team),
                ],
            }));
            return true;
        });
        const deleteTeam = vi.fn(async (game: string, id: string) => {
            teams.update((value) => ({
                ...value,
                [game]: value[game].filter((team) => team.id !== id),
            }));
            return true;
        });
        const store = {
            teams,
            entries,
            characterRules: signal({ genshin: { teamSize: 1 } }),
            saveTeam,
            deleteTeam,
            initialized: signal(true),
            saving: signal(false),
            loading: signal(false),
            canEdit: signal(false),
            error: signal('Save failed'),
        };
        TestBed.configureTestingModule({
            providers: [provideRouter([]), { provide: WorkspaceStore, useValue: store }],
        });
        const fixture = TestBed.createComponent(Teams);
        fixture.componentRef.setInput('game', 'genshin');
        fixture.detectChanges();
        await fixture.whenStable();
        return { fixture, store, root: fixture.nativeElement as HTMLElement };
    }
    it('lets ordinary players create a team using only owned characters and the configured capacity', async () => {
        const { fixture, store, root } = await setup();
        const component = fixture.componentInstance;
        component.edit();
        fixture.detectChanges();
        expect(root.querySelectorAll('.team-character')).toHaveLength(2);
        expect(root.querySelector('.team-character-picker')?.textContent).not.toContain('Unowned');
        component.draft!.name = 'My team';
        component.toggle('one');
        component.toggle('two');
        expect(component.draft!.members).toEqual(['one']);
        await component.save();
        fixture.detectChanges();
        expect(store.saveTeam).toHaveBeenCalledWith(
            'genshin',
            expect.objectContaining({ name: 'My team', members: ['one'] }),
        );
        expect(root.querySelector('.team-card')?.textContent).toContain('My team');
        expect(root.querySelector('.team-card')?.textContent).toContain('One');
    });
    it('keeps editing isolated, retains failed drafts, and confirms deletion without removing characters', async () => {
        const { fixture, store } = await setup();
        const team = { id: 'team', name: 'Original', notes: '', members: ['one'] };
        store.teams.set({ genshin: [team] });
        const component = fixture.componentInstance;
        component.edit(team);
        component.draft!.name = 'Changed';
        expect(team.name).toBe('Original');
        store.saveTeam.mockResolvedValueOnce(false);
        await component.save();
        expect(component.draft!.name).toBe('Changed');
        expect(component.error).toBe('Save failed');
        component.close();
        component.removing = team;
        expect(store.deleteTeam).not.toHaveBeenCalled();
        await component.remove();
        expect(store.teams()['genshin']).toHaveLength(0);
        expect(store.entries()[0].characterCollection!.owned).toBe(true);
    });
    it('requires unavailable members to be removed before saving and resets drafts on a game change', async () => {
        const { fixture, store } = await setup();
        const component = fixture.componentInstance;
        component.edit({ id: 'team', name: 'Old team', notes: '', members: ['unowned'] });
        await component.save();
        expect(store.saveTeam).not.toHaveBeenCalled();
        component.toggle('unowned');
        component.toggle('one');
        await component.save();
        expect(store.saveTeam).toHaveBeenCalled();
        component.edit();
        fixture.componentRef.setInput('game', 'hsr');
        fixture.detectChanges();
        expect(component.draft).toBeNull();
        expect(component.collection().map((entry) => entry.id)).toEqual(['other']);
    });
});
