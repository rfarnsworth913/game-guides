import { createHash } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { auth, AuthOptions, AuthResult } from 'express-oauth2-jwt-bearer';
import { Identity, Security } from './auth';
import { ApiError } from './repository';

export type Auth0Config = { origin: string; domain: string; clientId: string; audience: string; editors: string[] };

/** Angular obtains tokens through Auth0's SDK; Auth0's API SDK validates them here. */
export class Auth0Security implements Security {
    private readonly validate: ReturnType<typeof auth>;
    private readonly identities = new WeakMap<IncomingMessage, Promise<Identity>>();
    private readonly issuer: string;
    constructor(private readonly config: Auth0Config, publicKey?: AuthOptions['publicKey']) {
        this.issuer = `https://${config.domain}/`;
        this.validate = auth({
            issuer: this.issuer,
            audience: config.audience,
            tokenSigningAlg: 'RS256',
            ...(publicKey ? { publicKey } : { jwksUri: this.issuer + '.well-known/jwks.json' }),
            dpop: { enabled: false },
        });
    }
    private async identity(request: IncomingMessage): Promise<Identity> {
        const authorization = request.headers.authorization;
        if (typeof authorization !== 'string' || !/^Bearer \S+$/i.test(authorization)) throw new ApiError(401, 'Sign in to continue.');
        // Adapt the existing Node HTTP server to the official Express-compatible validator.
        const adapted = {
            headers: { authorization, host: new URL(this.config.origin).host },
            method: request.method ?? 'GET',
            protocol: new URL(this.config.origin).protocol.slice(0, -1),
            url: request.url ?? '/',
            query: {}, body: undefined,
            get: (name: string) => name.toLowerCase() === 'host' ? new URL(this.config.origin).host : undefined,
            is: () => false,
            auth: undefined as AuthResult | undefined,
        };
        try {
            await new Promise<void>((resolve, reject) => {
                this.validate(adapted as unknown as Parameters<typeof this.validate>[0],
                    {} as Parameters<typeof this.validate>[1], (error?: unknown) => error ? reject(error) : resolve());
            });
            const claims = adapted.auth?.payload;
            if (!claims || typeof claims.sub !== 'string' || !claims.sub ||
                (claims['azp'] ?? claims['client_id']) !== this.config.clientId) throw new Error('Invalid application identity.');
            return {
                id: createHash('sha256').update(this.issuer + '\n' + claims.sub).digest('hex'),
                name: typeof claims['name'] === 'string' ? claims['name'].slice(0, 100) : 'Player',
                editor: this.config.editors.includes(claims.sub),
                csrf: '', // Bearer tokens are explicitly attached by the SDK, never read from cookies.
            };
        } catch { throw new ApiError(401, 'Your sign-in could not be verified. Please sign in again.'); }
    }
    async requireUser(request: IncomingMessage, write = false): Promise<Identity> {
        if (write && request.headers.origin !== this.config.origin) throw new ApiError(403, 'Invalid request origin.');
        let user = this.identities.get(request);
        if (!user) { user = this.identity(request); this.identities.set(request, user); }
        return user;
    }
    async requireEditor(request: IncomingMessage): Promise<Identity> {
        const user = await this.requireUser(request, true);
        if (!user.editor) throw new ApiError(403, 'An editor account is required.');
        return user;
    }
    async handle(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
        if (!url.pathname.startsWith('/api/auth/')) return false;
        response.setHeader('Cache-Control', 'no-store');
        if (url.pathname !== '/api/auth/session' || request.method !== 'GET') throw new ApiError(404, 'Use the Auth0 SDK to sign in or sign out.');
        const user = request.headers.authorization ? await this.requireUser(request) : null;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ configured: true, user: user ? { id: user.id, name: user.name, editor: user.editor } : null, csrf: null }));
        return true;
    }
}
