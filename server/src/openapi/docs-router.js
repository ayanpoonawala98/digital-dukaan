// Read-only API docs: GET /docs (Swagger UI) and GET /docs/openapi.json. Serves the committed spec file only.
// The spec holds no secrets and no data. "Try it out" sends whatever bearer token the visitor pastes, from their own browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

const specPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../openapi.json');
export function docsRouter() {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const r = Router();
  r.use((req, res, next) => (req.method === 'GET' || req.method === 'HEAD' ? next() : res.status(405).set('Allow', 'GET, HEAD').json({ error: 'Docs are read-only' })));
  // Swagger UI needs inline script/style, so the strict CSP of the main app is relaxed for /docs only.
  r.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } }));
  r.get('/openapi.json', (req, res) => res.json(spec));
  r.use('/', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Digital Shop API', swaggerOptions: { supportedSubmitMethods: ['get'], persistAuthorization: false, docExpansion: 'none', tagsSorter: 'alpha' } }));
  return r;
}
