import { TestBed } from '@angular/core/testing';
import { convertToParamMap, Router, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { gameWorkspaceGuard } from './game-workspace.guard';
import { WorkspaceStore } from '../state/workspace.store';
import { RequestError } from '../state/services/workspace-api';

describe('Game workspace access', () => {
    it.each([401, 403, 404])('redirects denied direct game links (%s) before mounting a workspace', async status => {
        const authorize = vi.fn().mockRejectedValue(new RequestError(status, 'Unavailable'));
        TestBed.configureTestingModule({ providers: [
            { provide: WorkspaceStore, useValue: { initialized: () => true, authorizeGameWorkspace: authorize } },
            { provide: Router, useValue: { parseUrl: (url: string) => url } },
        ] });
        const route = { paramMap: convertToParamMap({ game: 'genshin', page: 'story' }) } as ActivatedRouteSnapshot;
        const result = await TestBed.runInInjectionContext(() => gameWorkspaceGuard(route, {} as RouterStateSnapshot));
        expect(result).toBe('/games');
        expect(authorize).toHaveBeenCalledWith('genshin', 'story');
    });
    it('allows a server-authorized workspace', async () => {
        TestBed.configureTestingModule({ providers: [
            { provide: WorkspaceStore, useValue: { initialized: () => true, authorizeGameWorkspace: vi.fn().mockResolvedValue(globalThis.undefined) } },
            { provide: Router, useValue: { parseUrl: (url: string) => url } },
        ] });
        const route = { paramMap: convertToParamMap({ game: 'genshin', page: 'story' }) } as ActivatedRouteSnapshot;
        expect(await TestBed.runInInjectionContext(() => gameWorkspaceGuard(route, {} as RouterStateSnapshot))).toBe(true);
    });
});
