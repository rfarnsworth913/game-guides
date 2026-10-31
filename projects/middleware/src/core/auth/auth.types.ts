import type { IncomingMessage, ServerResponse } from 'node:http';

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
export type Auth0Config = { origin: string; domain: string; clientId: string; audience: string; editors: string[] };
