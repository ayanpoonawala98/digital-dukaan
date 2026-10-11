import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// Build metadata for the superadmin System status page. Missing on a local build; the page then says Unknown.
const revision = String(process.env.COMMIT_REF || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || '').slice(0, 7);
export default defineConfig({ plugins: [react()], define: { __APP_VERSION__: JSON.stringify(pkg.version || ''), __APP_REVISION__: JSON.stringify(revision) }, server: { proxy: { '/api': 'http://localhost:4000', '/uploads': 'http://localhost:4000' } } });
