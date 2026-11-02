const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function drive(identity, fetch) {
  const context = vm.createContext({ crypto, btoa, URL, URLSearchParams, TextEncoder, Uint8Array, AbortSignal, fetch, browser: { identity } });
  vm.runInContext(fs.readFileSync('extension/lib/drive.js', 'utf8'), context); return context.PokeDrive;
}
test('OAuth uses PKCE and validates state before exchanging authorization code', async () => {
  let authURL; let called = false;
  const identity = { getRedirectURL: () => 'https://test.extensions.allizom.org/', async launchWebAuthFlow({ url }) { authURL = new URL(url); return 'https://test.extensions.allizom.org/?code=example&state=WRONG'; } };
  const d = drive(identity, async () => { called = true; });
  await assert.rejects(d.authorize({ clientId: 'example', clientSecret: 'secret' }), /验证失败/);
  assert.equal(called, false); assert.equal(authURL.searchParams.get('response_type'), 'code'); assert.equal(authURL.searchParams.get('code_challenge_method'), 'S256'); assert.ok(authURL.searchParams.get('state').length > 30);
});
test('OAuth exchange sends matching verifier and checks appdata scope', async () => {
  let authURL;
  const identity = { getRedirectURL: () => 'https://test.extensions.allizom.org/', async launchWebAuthFlow({ url }) { authURL = new URL(url); return `https://test.extensions.allizom.org/?code=example&state=${authURL.searchParams.get('state')}`; } };
  const d = drive(identity, async (url, opts) => {
    const body = new URLSearchParams(opts.body); const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.get('code_verifier')))).toString('base64url');
    assert.equal(challenge, authURL.searchParams.get('code_challenge')); assert.equal(body.get('client_secret'), 'secret');
    return new Response(JSON.stringify({ access_token: 'token', refresh_token: 'refresh', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.appdata' }));
  });
  const result = await d.authorize({ clientId: 'example', clientSecret: 'secret' }); assert.equal(result.refreshToken, 'refresh');
});
test('Drive pagination only returns own application shard files and preserves authorization header', async () => {
  let count = 0;
  const d = drive({}, async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer token'); const parsed = new URL(url); assert.equal(parsed.searchParams.get('spaces'), 'appDataFolder'); count++;
    return new Response(JSON.stringify(count === 1 ? { files: [{ id: 'a', name: '52poke-mark-v1-deviceA.json' }, { id: 'x', name: 'unrelated.json' }], nextPageToken: 'next' } : { files: [{ id: 'b', name: '52poke-mark-v1-deviceB.json' }] }));
  });
  const result = await d.list('token'); assert.equal(result.length, 2); assert.equal(count, 2);
});
