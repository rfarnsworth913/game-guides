import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, provideRouter, Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";

import { featureWorkspaceMatcher } from "./routes";
import { routes } from "./app.routes";
import { ErrorPage } from "./features/global/errors/error-page";
import { NotFoundPage } from "./features/global/errors/not-found-page";


@Component({
    selector: "gg-app-router-spec",
    template: ""
})
class WorkspaceFixture { }


describe("Application Routing", () => {

    it.each(["/gacha", "/anything", "/games/genshin/unsupported", "/games/genshin/inventory/extra"])("shows Not Found and preserves the unknown URL %s", async url => {
        TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
        const harness = await RouterTestingHarness.create();
        await harness.navigateByUrl(url, NotFoundPage);
        expect(harness.routeNativeElement?.querySelector("h1")?.textContent).toContain("doesn’t exist");
        expect(harness.routeNativeElement?.querySelector('a[href="/dashboard"]')).not.toBeNull();
        expect(TestBed.inject(Router).url).toBe(url);
    });

    it("opens the error page independently of workspace initialization", async () => {
        TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
        const harness = await RouterTestingHarness.create();
        await harness.navigateByUrl("/error", ErrorPage);
        expect(harness.routeNativeElement?.querySelector("h1")?.textContent).toBe("Something went wrong");
    });

    it("keeps the workspace mounted across base, readable and legacy story paths", async () => {
        TestBed.configureTestingModule({
            providers: [provideRouter([{ matcher: featureWorkspaceMatcher, component: WorkspaceFixture }])]
        });

        const harness = await RouterTestingHarness.create();
        const initial = await harness.navigateByUrl("/games/genshin/story", WorkspaceFixture);
        expect(await harness.navigateByUrl("/genshin/story/inazuma", WorkspaceFixture)).toBe(initial);

        const route = harness.routeDebugElement!.injector.get(ActivatedRoute);

        expect(route.snapshot.paramMap.get("game")).toBe("genshin");
        expect(route.snapshot.paramMap.get("page")).toBe("story");
        expect(route.snapshot.paramMap.get("section")).toBe("inazuma");

        expect(await harness.navigateByUrl("/genshin/story/mondstadt", WorkspaceFixture)).toBe(initial);
        expect(route.snapshot.paramMap.get("section")).toBe("mondstadt");

        expect(await harness.navigateByUrl("/games/zzz/story", WorkspaceFixture)).toBe(initial);
        expect(route.snapshot.paramMap.get("game")).toBe("zzz");
        expect(route.snapshot.paramMap.get("section")).toBeNull();
    });
    it('opens the global events calendar without redirecting to the game collection', async () => {
        TestBed.configureTestingModule({ providers: [provideRouter(routes.map(route => route.loadComponent ? { ...route, loadComponent: globalThis.undefined, component: WorkspaceFixture } : route))] });
        const harness = await RouterTestingHarness.create();
        await harness.navigateByUrl('/events', WorkspaceFixture);
        const route = harness.routeDebugElement!.injector.get(ActivatedRoute);
        expect(route.snapshot.paramMap.get('page')).toBe('events');
        expect(route.snapshot.paramMap.get('game')).toBeNull();
        await harness.navigateByUrl('/games/genshin/events', WorkspaceFixture);
        expect(harness.routeDebugElement!.injector.get(ActivatedRoute).snapshot.paramMap.get('game')).toBe('genshin');
    });
});
