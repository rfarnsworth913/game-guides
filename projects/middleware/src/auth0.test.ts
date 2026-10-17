import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { IncomingMessage } from 'node:http';
import { Auth0Security, Auth0Config } from './auth0';

const config: Auth0Config = { origin: 'http://localhost:4200', domain: 'tenant.example', clientId: 'angular-client', audience: 'https://game-guides/api', editors: ['editor'] };
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const verifier = () => new Auth0Security(config, publicKey.export({ type: 'spki', format: 'pem' }).toString());
function token(overrides: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iss: 'https://tenant.example/', aud: config.audience, sub: 'alice', azp: config.clientId,
        iat: now, exp: now + 600, ...overrides })).toString('base64url');
    const content = header + '.' + payload;
    return content + '.' + sign('sha256', Buffer.from(content), privateKey).toString('base64url');
}
const request = (value?: string, origin = config.origin) => ({ method: 'GET', url: '/api/me/progress', headers: {
    ...(value ? { authorization: 'Bearer ' + value } : {}), origin,
} }) as IncomingMessage;

test('Auth0 API SDK validates issuer, audience, expiry, signature and authorized client', async () => {
    const security = verifier();
    const alice = await security.requireUser(request(token()));
    assert.equal(alice.id, createHash('sha256').update('https://tenant.example/\nalice').digest('hex'));
    assert.equal(alice.editor, false);
    assert.notEqual((await security.requireUser(request(token({ sub: 'bob' })))).id, alice.id);
    for (const claims of [{ iss: 'https://wrong.example/' }, { aud: 'angular-client' }, { exp: 1 }, { azp: 'other-app' }, { sub: '' }]) {
        await assert.rejects(security.requireUser(request(token(claims))), { status: 401 });
    }
    const valid = token();
    const parts = valid.split('.');
    parts[1] = Buffer.from(JSON.stringify({ sub: 'editor' })).toString('base64url');
    await assert.rejects(security.requireUser(request(parts.join('.'))), { status: 401 });
    await assert.rejects(security.requireUser(request()), { status: 401 });
});

test('Auth0 editing permissions come from the server allowlist and writes check the origin', async () => {
    const security = verifier();
    await assert.rejects(security.requireEditor(request(token({ editor: true }))), { status: 403 });
    assert.equal((await security.requireEditor(request(token({ sub: 'editor' })))).editor, true);
    await assert.rejects(security.requireEditor(request(token({ sub: 'editor' }), 'https://unrelated.example')), { status: 403 });
});
