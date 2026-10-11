import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET ||= 'a'.repeat(40);
process.env.CLIENT_URL = 'https://digitalshop.website,https://www.digitalshop.website';
const { default: app } = await import('./app.js');

const preflight = (base, path, origin, headers = 'content-type,x-ds-browser') => fetch(base + path, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': headers } });
test('credentialed preflight on /api/public works for platform origins and never grants credentials to anyone else', async () => {
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const ok = await preflight(base, '/api/public/stores/x/verify/status', 'https://digitalshop.website');
    assert.equal(ok.status, 204); assert.equal(ok.headers.get('access-control-allow-origin'), 'https://digitalshop.website');
    assert.equal(ok.headers.get('access-control-allow-credentials'), 'true'); assert.match(ok.headers.get('access-control-allow-headers'), /x-ds-browser/i);
    const get = await fetch(base + '/api/public/stores/x/verify/session', { headers: { origin: 'https://digitalshop.website' } });
    assert.equal(get.headers.get('access-control-allow-credentials'), 'true');
    const other = await preflight(base, '/api/public/stores/x/verify/status', 'https://evil.example');
    assert.equal(other.headers.get('access-control-allow-origin'), null); assert.equal(other.headers.get('access-control-allow-credentials'), null);
    // non-public routes keep the platform-only CORS, without credentials
    const owner = await preflight(base, '/api/owner/1/anything', 'https://digitalshop.website', 'authorization');
    assert.equal(owner.headers.get('access-control-allow-origin'), 'https://digitalshop.website'); assert.equal(owner.headers.get('access-control-allow-credentials'), null);
    const ownerBad = await preflight(base, '/api/owner/1/anything', 'https://evil.example', 'authorization');
    assert.equal(ownerBad.headers.get('access-control-allow-origin'), null);
  } finally { server.close(); }
});
