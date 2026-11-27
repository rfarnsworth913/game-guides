import type { AuthStore } from "../../auth/auth.store";

export class RequestError extends Error {
    constructor(readonly status: number, message: string) { super(message); }
}

/** Shared transport; authentication and server errors stay consistent across clients. */
export class WorkspaceApi {
    constructor(private readonly auth: AuthStore | null) {}
    async request(path: string, body?: unknown, method = body ? 'PUT' : 'GET', signal?:AbortSignal): Promise<unknown> {
        const init: RequestInit = {
            method,
            ...(body
                ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
                : {}),
            signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
        };
        const response = this.auth ? await this.auth.request(`/api/${path}`, init) : await fetch(`/api/${path}`, init);
        const data: unknown = await response.json();
        if (!response.ok) {
            throw new RequestError(response.status,
                data &&
                typeof data === 'object' &&
                'error' in data &&
                typeof data.error === 'string'
                    ? data.error
                    : 'Middleware request failed.',
            );
        }
        return data;
    }
}
