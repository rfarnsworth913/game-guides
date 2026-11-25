import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../../../core/state/workspace.store';
import { GameManager, type GameManagementRequest } from './game-manager';
import { defaultGameOverview, GAME_FEATURES, validGameId } from '@common/workspace/game-overview';
import type { GameOverview } from '@lib/types/game-overview.type';

describe('Game management editor', () => {
    beforeEach(() => {
        class PreviewURL extends URL {
            static override createObjectURL = vi.fn(() => 'blob:game-preview');
            static override revokeObjectURL = vi.fn();
        }
        vi.stubGlobal('URL', PreviewURL);
    });
    afterEach(() => vi.unstubAllGlobals());
    async function setup(request: GameManagementRequest = { action: 'add' }, games: GameOverview[] = []) {
        const store = { canEdit: () => true, saving: signal(false), gameRegistry: vi.fn(async () => games),
            saveGameOverview: vi.fn(async (game: GameOverview, create: boolean = false, remove: boolean = false): Promise<GameOverview> => ({ ...game, features: [...game.features], archived: remove || game.archived, revision: create ? 0 : game.revision + 1 })) };
        TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: store }, { provide: AuthStore, useValue: { request: vi.fn(), user: signal(null) } }] });
        const fixture = TestBed.createComponent(GameManager);
        fixture.componentRef.setInput('request', request);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        return { fixture, component: fixture.componentInstance, store, root: fixture.nativeElement as HTMLElement };
    }
    it('shows image picker previews and feature icons and puts identifiers in Advanced', async () => {
        const game = { ...defaultGameOverview('genshin'), icon: 'https://example.com/icon.png', banner: 'https://example.com/banner.png', subtitle: 'Legacy tagline' };
        const { fixture, component, root } = await setup({ action: 'edit', id: game.id }, [game]);
        expect(root.querySelectorAll('gg-game-image-picker')).toHaveLength(2);
        expect([...root.querySelectorAll<HTMLImageElement>('.image-preview')].map(image => image.src)).toEqual([game.icon, game.banner]);
        expect(root.querySelectorAll('.game-feature svg path')).toHaveLength(GAME_FEATURES.length);
        expect(root.textContent).not.toContain('Tagline');
        expect(root.querySelector<HTMLElement>('#game-advanced-panel')!.hidden).toBe(true);
        expect(component.draft?.description).toBe('Legacy tagline');
        component.selectTab('advanced');
        fixture.detectChanges();
        expect(root.querySelector<HTMLElement>('#game-overview-panel')!.hidden).toBe(true);
        expect(root.querySelector<HTMLInputElement>('[name=game-id]')!.readOnly).toBe(true);
        expect(component.iconPicker()?.value()).toBe(game.icon);
    });
    it('generates valid IDs without replacing manually edited identifiers or highlight colors', async () => {
        const { component } = await setup();
        component.setTitle('123 RPG');
        expect(validGameId(component.draft!.id)).toBe(true);
        component.setColor('#12abef');
        component.setId('manual-rpg');
        component.idEdited = true;
        component.draft!.short = 'CUSTOM';
        component.shortEdited = true;
        component.setTitle('New Title');
        expect(component.draft).toMatchObject({ id: 'manual-rpg', short: 'CUSTOM', color: '#12abef' });
        expect(component.valid()).toBe(true);
    });
    it('reports duplicate IDs and invalid advanced fields instead of silently rejecting submission', async () => {
        const { fixture, component, store, root } = await setup({ action: 'add' }, [defaultGameOverview('duplicate')]);
        component.setTitle('Duplicate');
        expect(component.errors().id).toContain('already exists');
        await component.save();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(component.tab()).toBe('advanced');
        expect(root.querySelector('.game-validation-summary')?.textContent).toContain('already exists');
        expect(store.saveGameOverview).not.toHaveBeenCalled();
        component.setId('new-rpg');
        component.draft!.short = ' ';
        component.setColor('url(https://example.com)');
        expect(component.errors().short).toBeTruthy();
        expect(component.errors().color).toBeTruthy();
        expect(component.valid()).toBe(false);
    });
    it('retains edits and the active tab when saving fails', async () => {
        const game = defaultGameOverview('genshin');
        const { component, store } = await setup({ action: 'edit', id: game.id }, [game]);
        component.draft!.description = 'Keep these edits';
        component.selectTab('advanced');
        store.saveGameOverview.mockRejectedValueOnce(new Error('Game changed in another session.'));
        await component.save();
        expect(component.error()).toContain('changed in another session');
        expect(component.draft?.description).toBe('Keep these edits');
        expect(component.tab()).toBe('advanced');
        expect(component.busy()).toBe(false);
    });
    it('does not create a second game when a deferred upload fails and is retried', async () => {
        const { fixture, component, store } = await setup();
        component.setTitle('New RPG');
        const picker = component.iconPicker()!;
        picker.pendingFile.set(new File(['image'], 'icon.png', { type: 'image/png' }));
        const upload = vi.spyOn(picker, 'commitPendingUpload').mockRejectedValueOnce(new Error('Upload failed'))
            .mockImplementationOnce(async () => {picker.pendingFile.set(null); return '/api/games/new-rpg/images/icon-a.png';});
        await component.save();
        expect(component.creating).toBe(false);
        expect(component.error()).toContain('game was created');
        expect(component.draft?.id).toBe('new-rpg');
        expect(picker.pendingFile()).not.toBeNull();
        await component.save();
        expect(upload).toHaveBeenCalledTimes(2);
        expect(store.saveGameOverview.mock.calls.filter(([, create]) => create)).toHaveLength(1);
        expect(component.draft).toBeNull();
        expect(component.registry()).toHaveLength(1);
        fixture.destroy();
    });
    it('archives the saved record after confirmation even if unsaved form fields are invalid', async () => {
        const game = defaultGameOverview('genshin');
        const { component, store } = await setup({ action: 'edit', id: game.id }, [game]);
        component.draft!.name = '';
        await component.save(true);
        expect(store.saveGameOverview).not.toHaveBeenCalled();
        component.confirmRemove = true;
        await component.save(true);
        expect(store.saveGameOverview).toHaveBeenCalledWith(game, false, true);
    });
});
