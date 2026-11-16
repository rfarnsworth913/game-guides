import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { GAMES } from '@lib/constants/workspace.constants';
import { WorkspaceSidebar, type SidebarLink } from './workspace-sidebar';
import { defaultGameOverview } from '@common/workspace/game-overview';

@Component({ selector: 'gg-sidebar-route-test', template: '' })
class RouteTarget {}

const links: SidebarLink[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '' },
    { id: 'games', label: 'Games Collection', icon: '' },
    { id: 'characters', label: 'Characters', icon: '' },
    { id: 'story', label: 'Story Guide', icon: '' },
    { id: 'achievements', label: 'Achievements', icon: '' },
];

describe('Workspace sidebar game selection', () => {
    beforeEach(() => {
        vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    });
    afterEach(() => vi.unstubAllGlobals());

    async function setup(activeGameId: string | null = 'genshin') {
        TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', component: RouteTarget }])] });
        const router = TestBed.inject(Router);
        await router.navigateByUrl('/games/genshin/story?section=region#quest');
        const fixture = TestBed.createComponent(WorkspaceSidebar);
        fixture.componentRef.setInput('activeGameId', activeGameId);
        fixture.componentRef.setInput('links', links);
        fixture.detectChanges();
        await fixture.whenStable();
        return { fixture, component: fixture.componentInstance, root: fixture.nativeElement as HTMLElement, router };
    }

    it('replaces only game navigation and preserves the full route until a new game is selected', async () => {
        const { fixture, component, root, router } = await setup();
        root.querySelector<HTMLButtonElement>('.active-game-selector')!.click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(component.mode()).toBe('game-selection');
        expect(router.url).toBe('/games/genshin/story?section=region#quest');
        expect(root.querySelector('a[href="/dashboard"]')).not.toBeNull();
        expect(root.querySelector('a[href="/games"]')).not.toBeNull();
        expect(root.querySelector('a[href="/games/genshin/story"]')).toBeNull();
        expect(root.querySelector('.is-current')?.textContent).toContain('Genshin Impact');
        expect(document.activeElement).toBe(root.querySelector('input'));
        root.querySelector<HTMLButtonElement>('.back-action')!.click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(router.url).toBe('/games/genshin/story?section=region#quest');
        expect(root.querySelector('a[href="/games/genshin/story"]')).not.toBeNull();
        expect(document.activeElement).toBe(root.querySelector('.active-game-selector'));
    });

    it('selects the current game without navigation and sends a different game to its overview', async () => {
        const { fixture, component, router } = await setup();
        const navigate = vi.spyOn(router, 'navigateByUrl');
        component.openSelector();
        await component.selectGame('genshin');
        expect(navigate).not.toHaveBeenCalled();
        expect(component.mode()).toBe('workspace');
        component.openSelector();
        await component.selectGame('hsr');
        expect(router.url).toBe('/games/hsr/dashboard');
        expect(component.mode()).toBe('workspace');
        fixture.componentRef.setInput('activeGameId', 'hsr');
        fixture.detectChanges();
        expect(component.activeGame()?.name).toBe('Honkai: Star Rail');
        expect(component.preferences.recentGameIds()[0]).toBe('hsr');
        expect((fixture.nativeElement as HTMLElement).querySelector('a[href="/games/hsr/story"]')).not.toBeNull();
    });

    it('searches by name and filters favorites without navigating', async () => {
        const { fixture, component, root, router } = await setup();
        component.openSelector();
        fixture.detectChanges();
        const favorite = root.querySelector<HTMLButtonElement>('[aria-label="Add Honkai: Star Rail to favorites"]')!;
        favorite.click();
        fixture.detectChanges();
        expect(router.url).toBe('/games/genshin/story?section=region#quest');
        expect(component.mode()).toBe('game-selection');
        component.filter.set('favorites');
        expect(component.games().map(game => game.id)).toEqual(['hsr']);
        component.filter.set('all');
        const search = root.querySelector<HTMLInputElement>('input')!;
        search.value = '  STAR rail  ';
        search.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        expect(component.games().map(game => game.id)).toEqual(['hsr']);
        component.searchQuery.set('no matching game');
        fixture.detectChanges();
        expect(root.textContent).toContain('No games match your search.');
        component.searchQuery.set('');
        component.filter.set('recent');
        expect(component.games().map(game => game.id)).toEqual(['genshin']);
    });

    it('opens with Ctrl+K and closes with Escape while preserving the route', async () => {
        const { fixture, component, root, router } = await setup();
        const opened = vi.fn();
        component.openNavigation.subscribe(opened);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
        fixture.detectChanges();
        await fixture.whenStable();
        expect(opened).toHaveBeenCalledOnce();
        expect(component.mode()).toBe('game-selection');
        expect(document.activeElement).toBe(root.querySelector('input'));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        fixture.detectChanges();
        await fixture.whenStable();
        expect(component.mode()).toBe('workspace');
        expect(router.url).toBe('/games/genshin/story?section=region#quest');
        expect(document.activeElement).toBe(root.querySelector('.active-game-selector'));
    });

    it('leaves selection open and reports a failed navigation', async () => {
        const { component, router } = await setup();
        vi.spyOn(router, 'navigateByUrl').mockRejectedValue(new Error('Navigation failed'));
        component.openSelector();
        await component.selectGame('hsr');
        expect(component.mode()).toBe('game-selection');
        expect(component.error()).toContain('Could not switch games');
        expect(component.switching()).toBe(false);
        expect(component.preferences.recentGameIds()).toEqual(['genshin']);
    });

    it('allows a global-to-game route change to destroy the previous sidebar', async () => {
        const { fixture, component, router } = await setup(null);
        vi.spyOn(router, 'navigateByUrl').mockImplementation(async () => { fixture.destroy(); return true; });
        component.openSelector();
        await expect(component.selectGame('hsr')).resolves.toBeUndefined();
        expect(component.error()).toBe('');
        expect(component.preferences.recentGameIds()).toEqual(['hsr']);
    });

    it('supports global pages and all catalog entries without inventing games or links', async () => {
        const { fixture, component, root } = await setup(null);
        expect(root.textContent).toContain('Choose a game');
        component.openSelector();
        fixture.detectChanges();
        expect(component.games()).toHaveLength(GAMES.length);
        expect(root.querySelectorAll('.game-choice')).toHaveLength(GAMES.length);
        expect(root.querySelector('[aria-current="true"]')).toBeNull();
        component.closeSelector();
        fixture.componentRef.setInput('activeGameId', 'ffxiv');
        fixture.componentRef.setInput('links', links.slice(0, 3));
        fixture.detectChanges();
        expect(root.querySelector('a[href="/games/ffxiv/characters"]')).not.toBeNull();
        expect(root.querySelector('a[href="/games/ffxiv/story"]')).toBeNull();
    });
    it('uses registry metadata and exposes management only to editors', async () => {
        const { fixture, component, root } = await setup('custom-rpg');
        fixture.componentRef.setInput('catalog', [{ ...defaultGameOverview('custom-rpg'), name: 'Custom RPG', features: ['characters'] }]);
        fixture.detectChanges();
        expect(root.querySelector('a[href="/games/custom-rpg/characters"]')).not.toBeNull();
        expect(root.querySelector('a[href="/games/custom-rpg/story"]')).toBeNull();
        component.openSelector();
        fixture.detectChanges();
        expect(root.querySelector('.game-management-actions')).toBeNull();
        fixture.componentRef.setInput('canManage', true);
        fixture.detectChanges();
        expect(root.querySelector('.game-management-actions')).not.toBeNull();
        expect(root.querySelector('[aria-label="Edit Custom RPG overview"]')).not.toBeNull();
        expect(component.games().map(game => game.name)).toEqual(['Custom RPG']);
    });
});
