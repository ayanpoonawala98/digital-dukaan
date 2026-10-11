// Walks an Express 4 app's router stack and produces an OpenAPI 3 document. Read-only: it never calls a route.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { overrides } from './overrides.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// "/^\/foo\/?(?=\/|$)/i" with keys -> "/foo"; params become {name}.
function mountPath(layer) {
  if (layer.regexp?.fast_slash) return '';
  let src = layer.regexp.source;
  const keys = (layer.keys || []).map(k => k.name);
  let i = 0;
  src = src.replace(/\(\?:\\\/\(\[\^\/\]\+\?\)\)/g, () => `/{${keys[i++]}}`);
  src = src.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\\\//g, '/');
  return src;
}

let AUTH = null;
const clean = p => (p.length > 1 ? p.replace(/\/+$/, '') : p);
function walk(stack, prefix, ctx, out) {
  for (const layer of stack) {
    if (layer.route) {
      const handlers = layer.route.stack.map(h => h.handle);
      for (const m of METHODS) if (layer.route.methods[m]) out.push({ method: m, path: clean(prefix + String(layer.route.path).replace(/:(\w+)(\([^)]*\))?/g, '{$1}')), ctx: { ...ctx, inlineAuth: ctx.auth || handlers.includes(AUTH) }, handlers });
    } else if (layer.handle?.stack) {
      const nextCtx = { ...ctx };
      // router-level auth middleware (r.use(auth, ...)) protects everything registered after it in that router
      const sub = layer.handle.stack;
      const guarded = sub.slice(0, 3).some(l => !l.route && l.handle === AUTH);
      if (guarded) nextCtx.auth = true;
      walk(sub, prefix + mountPath(layer), nextCtx, out);
    }
  }
}

// Comment line directly above a route registration, found by scanning the source (best effort, unique match only).
function commentIndex() {
  const idx = new Map();
  const files = [];
  (function scan(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') scan(p); } else if (/\.js$/.test(e.name) && !/\.test\.js$/.test(e.name)) files.push(p); } })(SRC);
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((ln, n) => {
      const m = ln.match(/\b(?:r|router|app)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/);
      if (!m) return;
      const prev = (lines[n - 1] || '').trim();
      const key = `${m[1]} ${m[2].replace(/:(\w+)/g, '{$1}')}`;
      const text = prev.startsWith('//') ? prev.replace(/^\/\/\s*/, '') : '';
      idx.set(key, idx.has(key) ? null : text); // null = ambiguous
    });
  }
  return idx;
}

const GROUPS = [
  ['/api/auth', 'Auth'], ['/api/public', 'Storefront (public)'], ['/api/owner', 'Owner and staff'], ['/api/admin', 'Superadmin'],
  ['/api/internal', 'Internal (cron secret)'], ['/api/integrations', 'Integrations (webhooks)'], ['/api/health', 'Health']
];
const pathParams = p => [...p.matchAll(/\{(\w+)\}/g)].map(m => ({ name: m[1], in: 'path', required: true, schema: { type: /(^id$|Id$|^storeId$|^n$)/.test(m[1]) ? 'integer' : 'string' } }));

export function buildSpec(app, { auth }) {
  AUTH = auth;
  const found = [];
  walk(app._router.stack, '', {}, found);
  const comments = commentIndex();
  const paths = {};
  for (const r of found) {
    if (!r.path.startsWith('/api')) continue; // /uploads static etc. are not API routes
    const tag = (GROUPS.find(([p]) => r.path.startsWith(p)) || [null, 'Other'])[1];
    const secured = tag === 'Owner and staff' || tag === 'Superadmin' || (tag === 'Auth' && r.ctx.inlineAuth) || (tag === 'Storefront (public)' && r.ctx.inlineAuth);
    const subPath = r.path.replace(/^\/api\/(owner|admin)\//, '');
    const key = `${r.method} ${subPath.startsWith('/') ? subPath : '/' + subPath}`;
    const note = comments.get(`${r.method} ${r.path.replace(/^\/api\/(owner|admin|public|auth)/, '').replace(/^\/\{storeId\}/, '/{storeId}')}`) ?? comments.get(key);
    const op = {
      tags: [tag],
      summary: `${r.method.toUpperCase()} ${r.path}`,
      ...(note ? { description: note } : {}),
      operationId: `${r.method}_${r.path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
      parameters: pathParams(r.path),
      ...(['post', 'put', 'patch'].includes(r.method) ? { requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } } } : {}),
      responses: { 200: { description: 'Success (JSON)', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }, 400: { $ref: '#/components/responses/Error' }, ...(secured ? { 401: { $ref: '#/components/responses/Error' }, 403: { $ref: '#/components/responses/Error' } } : {}), 404: { $ref: '#/components/responses/Error' } },
      ...(tag === 'Internal (cron secret)' ? { security: [{ cronSecret: [] }] } : secured ? { security: [{ bearerAuth: [] }] } : { security: [] })
    };
    const ov = overrides[`${r.method} ${r.path}`];
    const merged = ov ? { ...op, ...ov, responses: { ...op.responses, ...(ov.responses || {}) } } : op;
    (paths[r.path] ||= {})[r.method] = merged;
  }
  const sorted = Object.fromEntries(Object.keys(paths).sort().map(k => [k, paths[k]]));
  return {
    openapi: '3.0.3',
    info: { title: 'Digital Shop API', version: '1.0.0', description: 'Generated from the live Express routes, so every path listed exists in code. Request and response bodies are generic objects unless an endpoint has a detailed schema. Authenticated routes expect `Authorization: Bearer <token>` from POST /api/auth/login. Role rules: owner routes need an owner or staff user (some actions are owner-only), admin routes need superadmin. Responses use `{ "error": "message" }` on failure.' },
    servers: [{ url: '/', description: 'This server' }],
    tags: GROUPS.map(([, name]) => ({ name })),
    paths: sorted,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, cronSecret: { type: 'http', scheme: 'bearer', description: 'CRON_SECRET value (server-side only)' } },
      responses: { Error: { description: 'Error', content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } } } }
    }
  };
}
