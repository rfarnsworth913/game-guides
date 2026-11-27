import { Injector, runInInjectionContext } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';
import { AuthStore } from "./auth.store";

describe('Auth0 integration', () => {
    afterEach(() => vi.unstubAllGlobals());
    function sdk(authenticated = true) {
        return { error$: new Subject<Error>(), isLoading$: of(false), isAuthenticated$: of(authenticated), user$: of({ name: 'Alice' }),
            getAccessTokenSilently: vi.fn(() => of('api-access-token')), loginWithRedirect: vi.fn(() => of(globalThis.undefined)), logout: vi.fn(() => of(globalThis.undefined)) };
    }
    it('uses the SDK token for API requests and the backend for editor permission', async () => {
        const client = sdk();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ configured: true, user: { id: 'alice', name: 'Player', editor: false }, csrf: null }) }));
        const auth = runInInjectionContext(Injector.create({ providers: [{ provide: AuthService, useValue: client as unknown as AuthService }] }), () => new AuthStore());
        await auth.initialize();
        expect(auth.user()).toEqual({ id: 'alice', name: 'Alice', editor: false });
        expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer api-access-token');
        await expect(auth.request('https://unrelated.example/api')).rejects.toThrow('Invalid API path');
    });
    it('uses SDK redirect login and signup, preserving the current route', async () => {
        const client = sdk(false);
        const auth = runInInjectionContext(Injector.create({ providers: [{ provide: AuthService, useValue: client as unknown as AuthService }] }), () => new AuthStore());
        await auth.login(true);
        expect(client.loginWithRedirect).toHaveBeenCalledWith(expect.objectContaining({ authorizationParams: { screen_hint: 'signup' }, appState: { target: window.location.pathname + window.location.search + window.location.hash } }));
        await auth.logout();
        expect(client.logout).toHaveBeenCalledWith({ logoutParams: { returnTo: window.location.origin + '/' } });
    });
    it('allows guest initialization without requesting tokens or private progress', async () => {
        const client = sdk(false);
        const auth = runInInjectionContext(Injector.create({ providers: [{ provide: AuthService, useValue: client as unknown as AuthService }] }), () => new AuthStore());
        await auth.initialize();
        expect(auth.configured()).toBe(true);
        expect(auth.user()).toBeNull();
        expect(client.getAccessTokenSilently).not.toHaveBeenCalled();
    });
    it('clears only the SDK session after an invalid refresh token and blocks request retries', async () => {
        const client = sdk();
        const failure = Object.assign(new Error('Unknown or invalid refresh token.'), { error: 'invalid_grant' });
        client.getAccessTokenSilently.mockImplementation(() => throwError(() => failure));
        vi.stubGlobal('fetch', vi.fn());
        const auth = runInInjectionContext(Injector.create({ providers: [{ provide: AuthService, useValue: client as unknown as AuthService }] }), () => new AuthStore());
        auth.user.set({ id: 'alice', name: 'Alice', editor: true });
        await Promise.all([
            expect(auth.request('/api/games')).rejects.toThrow('Sign in again'),
            expect(auth.request('/api/me/progress', { method: 'PATCH', body: '{}' })).rejects.toThrow('Sign in again'),
        ]);
        expect(client.logout).toHaveBeenCalledExactlyOnceWith({ openUrl: false });
        expect(auth.reauthenticationRequired()).toBe(true);
        expect(auth.user()).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
        const attempts = client.getAccessTokenSilently.mock.calls.length;
        await expect(auth.request('/api/games')).rejects.toThrow('Sign in again');
        expect(client.getAccessTokenSilently).toHaveBeenCalledTimes(attempts);
        await auth.login();
        expect(client.loginWithRedirect).toHaveBeenCalledWith(expect.objectContaining({ appState: { target: window.location.pathname + window.location.search + window.location.hash } }));
    });
    it('handles an invalid refresh token reported during SDK startup', async () => {
        const client = sdk(false);
        const auth = runInInjectionContext(Injector.create({ providers: [{ provide: AuthService, useValue: client as unknown as AuthService }] }), () => new AuthStore());
        client.error$.next(Object.assign(new Error('Unknown or invalid refresh token.'), { error: 'invalid_grant' }));
        await auth.initialize();
        expect(auth.reauthenticationRequired()).toBe(true);
        expect(auth.error()).toContain('Sign in again');
        expect(client.logout).toHaveBeenCalledWith({ openUrl: false });
        expect(client.getAccessTokenSilently).not.toHaveBeenCalled();
    });
    it('does not sign out on a network error or an API permission denial', async () => {
        const client = sdk();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'An editor account is required.' }), { status: 403 })));
        const auth = runInInjectionContext(Injector.create({ providers: [{ provide: AuthService, useValue: client as unknown as AuthService }] }), () => new AuthStore());
        auth.user.set({ id: 'alice', name: 'Alice', editor: false });
        expect((await auth.request('/api/games/registry')).status).toBe(403);
        client.getAccessTokenSilently.mockImplementation(() => throwError(() => new Error('Network unavailable')));
        await expect(auth.request('/api/me/progress')).rejects.toThrow('Network unavailable');
        expect(auth.reauthenticationRequired()).toBe(false);
        expect(auth.user()?.id).toBe('alice');
        expect(client.logout).not.toHaveBeenCalled();
    });
});
