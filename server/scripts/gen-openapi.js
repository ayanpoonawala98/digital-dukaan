// Builds server/openapi.json from the real Express app, so only routes that exist in code are documented.
// Run: npm run openapi -w digital-dukaan-server   (also checked by openapi.test.js so the file cannot go stale)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSpec } from '../src/openapi/build-spec.js';
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../openapi.json');
process.env.DATABASE_URL ||= 'postgres://docs:docs@127.0.0.1:5432/docs'; // never connected, only needed to import the app
const { default: app } = await import('../src/app.js');
const { auth } = await import('../src/shared/middleware/auth.js');
fs.writeFileSync(out, JSON.stringify(buildSpec(app, { auth }), null, 2) + '\n');
console.log('wrote', out);
process.exit(0);
