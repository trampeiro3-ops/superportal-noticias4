import assert from 'node:assert/strict';
import worker from '../cloudflare/_worker.js';

const html = '<!doctype html><html><head><link rel="canonical" href="__VERTICE_CANONICAL__"></head><body>VÉRTICE</body></html>';
const assets = {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    if (url.pathname === '/admin/login.html') {
      return new Response('<html>LOGIN</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    return new Response('Not found', { status: 404 });
  }
};
const env = {
  ASSETS: assets,
  TURSO_DATABASE_URL: 'libsql://example-test.turso.io',
  TURSO_AUTH_TOKEN: 'test-token',
  ADMIN_TOKEN: 'a-test-admin-token-that-is-long-enough-for-local-smoke-tests'
};

const home = await worker.fetch(new Request('https://vertice-test.pages.dev/'), env);
assert.equal(home.status, 200, 'home page should be served');
assert.match(await home.text(), /https:\/\/vertice-test\.pages\.dev\//, 'canonical URL should be replaced');
assert.equal(home.headers.get('x-frame-options'), 'DENY', 'security headers should be present');

const login = await worker.fetch(new Request('https://vertice-test.pages.dev/admin'), env);
assert.equal(login.status, 200, 'admin route should return login page without a session');
assert.match(await login.text(), /LOGIN/, 'admin login asset should be returned');
assert.equal(login.headers.get('cache-control'), 'no-store, private, max-age=0');

const missingConfig = await worker.fetch(new Request('https://vertice-test.pages.dev/'), { ASSETS: assets });
assert.equal(missingConfig.status, 503, 'missing Turso credentials should fail closed');

const method = await worker.fetch(new Request('https://vertice-test.pages.dev/api/cron', { method: 'GET' }), env);
assert.equal(method.status, 405, 'cron endpoint should reject non-POST methods');

const cronUnconfigured = await worker.fetch(new Request('https://vertice-test.pages.dev/api/cron', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: 'x' })
}), env);
assert.equal(cronUnconfigured.status, 503, 'cron should require a configured secret');

const cronUnauthorized = await worker.fetch(new Request('https://vertice-test.pages.dev/api/cron', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: 'wrong-secret' })
}), { ...env, CRON_SECRET: 'this-is-a-valid-test-cron-secret-with-32-characters' });
assert.equal(cronUnauthorized.status, 401, 'cron should reject incorrect secrets');

console.log('Smoke tests passed: home, admin login, security headers, missing config and cron access control.');
