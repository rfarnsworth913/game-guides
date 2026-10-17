import { of, Subject } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';
import { AuthStore } from './auth.store';

describe('Auth0 integration', () => {
    afterEach(() => vi.unstubAllGlobals());
    function sdk(authenticated = true) {
        return { error$: new Subject<Error>(), isLoading$: of(false), isAuthenticated$: of(authenticated), user$: of({ name: 'Alice' }),
            getAccessTokenSilently: vi.fn(() => of('api-access-token')), loginWithRedirect: vi.fn(() => of(undefined)), logout: vi.fn(() => of(undefined)) };
    }
    it('uses the SDK token for API requests and the backend for editor permission', async () => {
        const client = sdk();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ configured: true, user: { id: 'alice', name: 'Player', editor: false }, csrf: null }) }));
        const auth = new AuthStore(client as unknown as AuthService);
        await auth.initialize();
        expect(auth.user()).toEqual({ id: 'alice', name: 'Alice', editor: false });
        expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer api-access-token');
        await expect(auth.request('https://unrelated.example/api')).rejects.toThrow('Invalid API path');
    });
    it('uses SDK redirect login and signup, preserving the current route', async () => {
        const client = sdk(false);
        const auth = new AuthStore(client as unknown as AuthService);
        await auth.login(true);
        expect(client.loginWithRedirect).toHaveBeenCalledWith(expect.objectContaining({ authorizationParams: { screen_hint: 'signup' }, appState: { target: window.location.pathname + window.location.search + window.location.hash } }));
        await auth.logout();
        expect(client.logout).toHaveBeenCalledWith({ logoutParams: { returnTo: window.location.origin + '/' } });
    });
    it('allows guest initialization without requesting tokens or private progress', async () => {
        const client = sdk(false);
        const auth = new AuthStore(client as unknown as AuthService);
        await auth.initialize();
        expect(auth.configured()).toBe(true);
        expect(auth.user()).toBeNull();
        expect(client.getAccessTokenSilently).not.toHaveBeenCalled();
    });
});
