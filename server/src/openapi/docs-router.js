// Read-only API docs: GET /docs (Swagger UI) and GET /docs/openapi.json. Serves the committed spec file only.
// The spec holds no secrets and no data. "Try it out" sends whatever bearer token the visitor pastes, from their own browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

const specPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../openapi.json');
// Runs in the browser (swagger-ui-express serialises it as-is, so no closures). Every Try-it-out call must carry a pasted token.
export function docsRequestInterceptor(req) {
  var MSG = 'Paste your token via Authorize first. Try it out sends nothing without one.';
  var token = '';
  try {
    var a = window.ui.authSelectors.authorized();
    var b = a && a.getIn(['bearerAuth', 'value']), c = a && a.getIn(['cronSecret', 'value']);
    token = String(b || c || '').replace(/^Bearer\s+/i, '').trim();
  } catch (e) { token = ''; }
  if (!token) {
    var el = document.getElementById('docs-token-gate');
    if (!el) { el = document.createElement('div'); el.id = 'docs-token-gate'; el.setAttribute('role', 'alert'); el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;background:#7f1d1d;color:#fff;padding:12px 18px;border-radius:8px;font:600 14px sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3)'; document.body.appendChild(el); }
    el.textContent = MSG; el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, 6000);
    throw new Error(MSG);
  }
  req.headers = req.headers || {};
  req.headers.Authorization = 'Bearer ' + token;
  return req;
}
export function docsRouter() {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const r = Router();
  r.use((req, res, next) => (req.method === 'GET' || req.method === 'HEAD' ? next() : res.status(405).set('Allow', 'GET, HEAD').json({ error: 'Docs are read-only' })));
  // Swagger UI needs inline script/style, so the strict CSP of the main app is relaxed for /docs only.
  r.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } }));
  r.get('/openapi.json', (req, res) => res.json(spec));
  r.use('/', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Digital Shop API', swaggerOptions: { supportedSubmitMethods: ['get'], requestInterceptor: docsRequestInterceptor, persistAuthorization: false, docExpansion: 'none', tagsSorter: 'alpha' } }));
  return r;
}
