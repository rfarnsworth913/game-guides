import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { gameWorkspaceMatcher } from './app.routes';

@Component({ template: '' })
class WorkspaceFixture {}

describe('Workspace story paths', () => {
    it('keeps the workspace mounted across base, readable and legacy story paths', async () => {
        TestBed.configureTestingModule({ providers: [provideRouter([{ matcher: gameWorkspaceMatcher, component: WorkspaceFixture }])] });
        const harness = await RouterTestingHarness.create();
        const initial = await harness.navigateByUrl('/games/genshin/story', WorkspaceFixture);
        expect(await harness.navigateByUrl('/genshin/story/inazuma', WorkspaceFixture)).toBe(initial);
        const route = harness.routeDebugElement!.injector.get(ActivatedRoute);
        expect(route.snapshot.paramMap.get('game')).toBe('genshin');
        expect(route.snapshot.paramMap.get('page')).toBe('story');
        expect(route.snapshot.paramMap.get('section')).toBe('inazuma');
        expect(await harness.navigateByUrl('/genshin/story/mondstadt', WorkspaceFixture)).toBe(initial);
        expect(route.snapshot.paramMap.get('section')).toBe('mondstadt');
        expect(await harness.navigateByUrl('/games/zzz/story', WorkspaceFixture)).toBe(initial);
        expect(route.snapshot.paramMap.get('game')).toBe('zzz');
        expect(route.snapshot.paramMap.get('section')).toBeNull();
    });
});
