import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Collection } from 'mongodb';
import * as oidc from 'openid-client';
import { ApiError } from './repository';

export type AuthConfig = {
    origin: string;
    issuer: string;
    clientId: string;
    clientSecret: string;
    editors: string[];
};
export type Identity = { id: string; name: string; editor: boolean; csrf: string };
export type SessionDocument = {
    _id: string;
    user: string;
    subject: string;
    name: string;
    csrf: string;
    expiresAt: Date;
    idleAt: Date;
};
export type LoginDocument = {
    _id: string;
    verifier: string;
    state: string;
    nonce: string;
    returnTo: string;
    expiresAt: Date;
};
export type Security = {
    handle(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean>;
    requireUser(request: IncomingMessage, write?: boolean): Promise<Identity>;
    requireEditor(request: IncomingMessage): Promise<Identity>;
};
const token = () => randomBytes(32).toString('base64url');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const hour = 3600000;
export function safeReturnTo(value: string | null): string {
    if (
        !value ||
        !value.startsWith('/') ||
        value.startsWith('//') ||
        Array.from(value).some((char) => char === '\\' || char.charCodeAt(0) <= 32)
    ) {
        return '/dashboard';
    }
    const parsed = new URL(value, 'https://return.invalid');
    return parsed.origin === 'https://return.invalid' && !parsed.pathname.startsWith('/api/')
        ? parsed.pathname + parsed.search + parsed.hash
        : '/dashboard';
}
export class AuthService implements Security {
    private readonly secure: boolean;
    private readonly sessionCookie: string;
    private readonly loginCookie: string;
    private discovery: Promise<oidc.Configuration> | null = null;
    constructor(
        private readonly config: AuthConfig,
        private readonly sessions: Collection<SessionDocument>,
        private readonly logins: Collection<LoginDocument>,
    ) {
        this.secure = new URL(config.origin).protocol === 'https:';
        this.sessionCookie = this.secure ? '__Host-gg-session' : 'gg-local-session';
        this.loginCookie = this.secure ? '__Host-gg-login' : 'gg-local-login';
    }
    async initialize(): Promise<void> {
        await this.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        await this.logins.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    }
    private configuration(): Promise<oidc.Configuration> {
        this.discovery ??= oidc
            .discovery(new URL(this.config.issuer), this.config.clientId, this.config.clientSecret)
            .then((configuration) => {
                oidc.enableNonRepudiationChecks(configuration);
                return configuration;
            })
            .catch((error: unknown) => {
                this.discovery = null;
                throw error;
            });
        return this.discovery;
    }
    private cookie(request: IncomingMessage, name: string): string | null {
        const values = (request.headers.cookie ?? '')
            .split(';')
            .map((item) => item.trim())
            .filter((item) => item.startsWith(name + '='));
        if (values.length !== 1) {
            return null;
        }
        const value = values[0].slice(name.length + 1);
        return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
    }
    private setCookie(
        response: ServerResponse,
        name: string,
        value: string,
        seconds: number,
    ): void {
        const existing = response.getHeader('Set-Cookie');
        response.setHeader('Set-Cookie', [
            ...(Array.isArray(existing)
                ? existing.map(String)
                : existing
                  ? [String(existing)]
                  : []),
            name +
                '=' +
                value +
                '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' +
                seconds +
                (this.secure ? '; Secure' : ''),
        ]);
    }
    private async identity(request: IncomingMessage): Promise<Identity | null> {
        const raw = this.cookie(request, this.sessionCookie);
        if (!raw) {
            return null;
        }
        const now = new Date();
        const session = await this.sessions.findOne({
            _id: hash(raw),
            expiresAt: { $gt: now },
            idleAt: { $gt: now },
        });
        if (!session) {
            return null;
        }
        await this.sessions.updateOne(
            { _id: session._id },
            { $set: { idleAt: new Date(Date.now() + hour) } },
        );
        return {
            id: session.user,
            name: session.name,
            editor: this.config.editors.includes(session.subject),
            csrf: session.csrf,
        };
    }
    async requireUser(request: IncomingMessage, write = false): Promise<Identity> {
        const user = await this.identity(request);
        if (!user) {
            throw new ApiError(401, 'Sign in to continue.');
        }
        if (write) {
            if (request.headers.origin !== this.config.origin) {
                throw new ApiError(403, 'Invalid request origin.');
            }
            const csrf = request.headers['x-csrf-token'];
            if (
                typeof csrf !== 'string' ||
                !/^[A-Za-z0-9_-]{43}$/.test(csrf) ||
                csrf.length !== user.csrf.length ||
                !timingSafeEqual(Buffer.from(csrf), Buffer.from(user.csrf))
            ) {
                throw new ApiError(403, 'Invalid CSRF token.');
            }
        }
        return user;
    }
    async requireEditor(request: IncomingMessage): Promise<Identity> {
        const user = await this.requireUser(request, true);
        if (!user.editor) {
            throw new ApiError(403, 'An editor account is required.');
        }
        return user;
    }
    async handle(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
        const path = url.pathname;
        if (!path.startsWith('/api/auth/')) {
            return false;
        }
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Referrer-Policy', 'no-referrer');
        if (path === '/api/auth/session' && request.method === 'GET') {
            const user = await this.identity(request);
            response.setHeader('Content-Type', 'application/json');
            response.end(
                JSON.stringify({
                    configured: true,
                    user: user ? { id: user.id, name: user.name, editor: user.editor } : null,
                    csrf: user?.csrf ?? null,
                }),
            );
        } else if (path === '/api/auth/login' && request.method === 'GET') {
            const configuration = await this.configuration();
            const raw = token();
            const verifier = oidc.randomPKCECodeVerifier();
            const state = oidc.randomState();
            const nonce = oidc.randomNonce();
            await this.logins.insertOne({
                _id: hash(raw),
                verifier,
                state,
                nonce,
                returnTo: safeReturnTo(url.searchParams.get('returnTo')),
                expiresAt: new Date(Date.now() + 600000),
            });
            this.setCookie(response, this.loginCookie, raw, 600);
            const redirect = oidc.buildAuthorizationUrl(configuration, {
                redirect_uri: this.config.origin + '/api/auth/callback',
                scope: 'openid profile',
                state,
                nonce,
                code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
                code_challenge_method: 'S256',
            });
            response.writeHead(302, { Location: redirect.href });
            response.end();
        } else if (path === '/api/auth/callback' && request.method === 'GET') {
            const raw = this.cookie(request, this.loginCookie);
            this.setCookie(response, this.loginCookie, '', 0);
            const flow = raw
                ? await this.logins.findOneAndDelete({
                      _id: hash(raw),
                      expiresAt: { $gt: new Date() },
                  })
                : null;
            if (!flow) {
                throw new ApiError(400, 'Login expired. Start sign-in again.');
            }
            let claims: ReturnType<oidc.TokenEndpointResponseHelpers['claims']>;
            try {
                const tokens = await oidc.authorizationCodeGrant(
                    await this.configuration(),
                    new URL(url.pathname + url.search, this.config.origin),
                    {
                        pkceCodeVerifier: flow.verifier,
                        expectedState: flow.state,
                        expectedNonce: flow.nonce,
                        idTokenExpected: true,
                    },
                );
                claims = tokens.claims();
                if (!claims?.sub) {
                    throw new Error('Missing identity');
                }
            } catch {
                throw new ApiError(400, 'Sign-in could not be verified. Please try again.');
            }
            const old = this.cookie(request, this.sessionCookie);
            if (old) {
                await this.sessions.deleteOne({ _id: hash(old) });
            }
            const session = token();
            await this.sessions.insertOne({
                _id: hash(session),
                user: hash(this.config.issuer + '\n' + claims.sub),
                subject: claims.sub,
                name: typeof claims['name'] === 'string' ? claims['name'].slice(0, 100) : 'Player',
                csrf: token(),
                expiresAt: new Date(Date.now() + 24 * hour),
                idleAt: new Date(Date.now() + hour),
            });
            this.setCookie(response, this.sessionCookie, session, 86400);
            response.writeHead(303, { Location: flow.returnTo });
            response.end();
        } else if (path === '/api/auth/logout' && request.method === 'POST') {
            await this.requireUser(request, true);
            const raw = this.cookie(request, this.sessionCookie)!;
            await this.sessions.deleteOne({ _id: hash(raw) });
            this.setCookie(response, this.sessionCookie, '', 0);
            response.writeHead(204);
            response.end();
        } else {
            throw new ApiError(404, 'Authentication route not found.');
        }
        return true;
    }
}
export const lockedSecurity: Security = {
    async handle(request, response, url) {
        if (url.pathname === '/api/auth/session' && request.method === 'GET') {
            response.setHeader('Content-Type', 'application/json');
            response.setHeader('Cache-Control', 'no-store');
            response.end(JSON.stringify({ configured: false, user: null, csrf: null }));
            return true;
        }
        if (url.pathname.startsWith('/api/auth/')) {
            throw new ApiError(503, 'Sign-in is not configured.');
        }
        return false;
    },
    async requireUser() {
        throw new ApiError(401, 'Sign in to continue.');
    },
    async requireEditor() {
        throw new ApiError(401, 'Sign in with an editor account.');
    },
};
