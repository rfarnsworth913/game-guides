import { Inject, Injectable, Optional, signal } from '@angular/core';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { filter, firstValueFrom, take } from 'rxjs';
export type Account = { id: string; name: string; editor: boolean };
@Injectable({ providedIn: 'root' })
export class AuthStore {
    constructor(@Optional() @Inject(Auth0Service) private readonly sdk: Auth0Service | null = null) {
        this.sdk?.error$.subscribe((error) => this.error.set(error.message || 'Authentication failed. Please sign in again.'));
    }
    get usesAuth0(): boolean { return this.sdk !== null; }
    readonly user = signal<Account | null>(null);
    readonly configured = signal(false);
    readonly error = signal('');
    private csrf: string | null = null;
    async initialize(): Promise<void> {
        if (this.sdk) {
            this.configured.set(true);
            await firstValueFrom(this.sdk.isLoading$.pipe(filter((loading) => !loading), take(1)));
            const authenticated = await firstValueFrom(this.sdk.isAuthenticated$);
            if (!authenticated) { this.user.set(null); return; }
        }
        const response = await this.request('/api/auth/session', {
            cache: 'no-store',
            credentials: 'same-origin',
        });
        if (!response.ok) {
            throw new Error('Could not verify your session. Reload to retry.');
        }
        const data = (await response.json()) as {
            configured: boolean;
            user: Account | null;
            csrf: string | null;
        };
        this.user.set(data.user);
        if (this.sdk && data.user) {
            const profile = await firstValueFrom(this.sdk.user$);
            this.user.set({ ...data.user, name: profile?.name || profile?.email || data.user.name });
        }
        this.configured.set(data.configured);
        this.csrf = data.csrf;
    }
    async login(signUp = false): Promise<void> {
        this.error.set('');
        if (this.sdk) {
            try {
                await firstValueFrom(this.sdk.loginWithRedirect({
                    appState: { target: window.location.pathname + window.location.search + window.location.hash },
                    ...(signUp ? { authorizationParams: { screen_hint: 'signup' } } : {}),
                }));
            } catch (error) { this.error.set(error instanceof Error ? error.message : 'Could not start sign-in.'); }
            return;
        }
        window.location.assign(
            '/api/auth/login?returnTo=' +
                encodeURIComponent(
                    window.location.pathname + window.location.search + window.location.hash,
                ),
        );
    }
    async logout(): Promise<boolean> {
        try {
            if (this.sdk) {
                await firstValueFrom(this.sdk.logout({ logoutParams: { returnTo: window.location.origin + '/' } }));
                this.user.set(null);
                this.csrf = null;
                return true;
            }
            const response = await this.request('/api/auth/logout', { method: 'POST' });
            if (!response.ok) {
                throw new Error('Could not sign out. Please retry.');
            }
            this.user.set(null);
            this.csrf = null;
            return true;
        } catch (error) {
            this.error.set(error instanceof Error ? error.message : 'Could not sign out.');
            return false;
        }
    }
    async request(path: string, init: RequestInit = {}): Promise<Response> {
        if (!path.startsWith('/api/') || path.startsWith('//') || path.includes('\\')) {
            throw new Error('Invalid API path.');
        }
        const resolved = new URL(path, 'https://api.invalid');
        if (resolved.origin !== 'https://api.invalid' || !resolved.pathname.startsWith('/api/')) {
            throw new Error('Invalid API path.');
        }
        const headers = new Headers(init.headers);
        if (this.sdk) {
            headers.delete('Authorization');
            if (await firstValueFrom(this.sdk.isAuthenticated$)) {
                const token = await firstValueFrom(this.sdk.getAccessTokenSilently());
                headers.set('Authorization', `Bearer ${token}`);
            }
        }
        if (this.csrf && !['GET', 'HEAD'].includes(init.method ?? 'GET')) {
            headers.set('X-CSRF-Token', this.csrf);
        }
        return fetch(path, {
            ...init,
            headers,
            credentials: 'same-origin',
            cache: 'no-store',
            mode: 'same-origin',
            redirect: 'error',
        });
    }
}
