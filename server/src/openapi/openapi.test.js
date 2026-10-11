import { docsRequestInterceptor } from './docs-router.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
process.env.DATABASE_URL ||= 'postgres://docs:docs@127.0.0.1:5432/docs';
const { default: app } = await import('../app.js');
const { auth } = await import('../shared/middleware/auth.js');
const { buildSpec } = await import('./build-spec.js');
const committed = JSON.parse(fs.readFileSync(new URL('../../openapi.json', import.meta.url), 'utf8'));
test('committed openapi.json matches the real routes (run: npm run openapi -w digital-dukaan-server)', () => {
  assert.deepEqual(committed, JSON.parse(JSON.stringify(buildSpec(app, { auth }))));
});
test('spec holds no secrets and marks private route groups as bearer-protected', () => {
  const text = JSON.stringify(committed);
  assert.ok(!/(sk_live|rzp_live|nfp_|github_pat_|-----BEGIN)/.test(text));
  assert.deepEqual(committed.paths['/api/auth/login'].post.security, []);
  assert.deepEqual(committed.paths['/api/admin/clients'].get.security, [{ bearerAuth: [] }]);
});
test('/docs and the spec are served read-only', async () => {
  const server = app.listen(0); const port = server.address().port;
  try {
    const ui = await fetch(`http://127.0.0.1:${port}/docs/`); assert.equal(ui.status, 200); assert.match(await ui.text(), /swagger/i);
    const js = await fetch(`http://127.0.0.1:${port}/docs/openapi.json`); assert.equal(js.status, 200); assert.equal((await js.json()).openapi, '3.0.3');
    const w = await fetch(`http://127.0.0.1:${port}/docs/openapi.json`, { method: 'POST' }); assert.notEqual(w.status, 200);
    const init = await (await fetch(`http://127.0.0.1:${port}/docs/swagger-ui-init.js`)).text();
    assert.match(init, /supportedSubmitMethods/); assert.doesNotMatch(init, /"url"\s*:\s*"http/); assert.doesNotMatch(init, /queryConfigEnabled\s*:\s*true/);
    assert.match(init, /"supportedSubmitMethods"\s*:\s*\[\s*"get"\s*\]/);
  } finally { server.close(); }
});

test('docs interceptor blocks Try-it-out calls without a token and adds the bearer header with one', () => {
  const mk = tok => { const els = {}; globalThis.document = { getElementById: id => els[id] || null, createElement: () => ({ style: {}, setAttribute() {} }), body: { appendChild: e => { els[e.id] = e; } } }; globalThis.setTimeout = globalThis.setTimeout; globalThis.window = { ui: { authSelectors: { authorized: () => ({ getIn: k => (tok && k[0] === 'bearerAuth' ? tok : undefined) }) } } }; };
  mk(''); assert.throws(() => docsRequestInterceptor({ url: 'http://x/api/public', headers: {} }), /Paste your token via Authorize first/);
  mk('abc.def'); const out = docsRequestInterceptor({ url: 'http://x/api/public', headers: {} }); assert.equal(out.headers.Authorization, 'Bearer abc.def');
  mk('Bearer tok2'); assert.equal(docsRequestInterceptor({ url: 'u', headers: {} }).headers.Authorization, 'Bearer tok2');
  delete globalThis.window; delete globalThis.document;
});
