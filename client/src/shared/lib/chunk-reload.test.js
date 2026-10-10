import test from 'node:test';
import assert from 'node:assert/strict';
import { isChunkError, canReloadNow, reloadForNewBuild } from './chunk-reload.js';
const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };
test('recognises stale chunk errors from Chrome, Safari and webpack', () => {
  assert.ok(isChunkError(new Error('Failed to fetch dynamically imported module: https://x/assets/a.js')));
  assert.ok(isChunkError(new Error('Importing a module script failed.')));
  assert.ok(isChunkError({ name: 'ChunkLoadError', message: 'x' }));
  assert.ok(!isChunkError(new Error('Cannot read properties of undefined')));
});
test('reload is allowed once per minute only', () => {
  const s = mem();
  assert.equal(canReloadNow(s, 1000), true);
  assert.equal(canReloadNow(s, 30000), false);
  assert.equal(canReloadNow(s, 62000), true);
});
test('reloadForNewBuild calls reload once then stops', () => {
  const s = mem(); let n = 0;
  assert.equal(reloadForNewBuild(s, () => n++), true);
  assert.equal(reloadForNewBuild(s, () => n++), false);
  assert.equal(n, 1);
});
