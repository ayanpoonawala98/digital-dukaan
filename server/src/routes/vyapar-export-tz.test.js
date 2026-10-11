import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// REPORT-01: the Vyapar CSV date must use IST, not the server timezone (a 20:26Z order is 7 Oct in India).
test('Vyapar export date is formatted in Asia/Kolkata', () => {
  const src = readFileSync(new URL('./owner.js', import.meta.url), 'utf8');
  assert.match(src, /new Date\(lead\.createdAt\)\.toLocaleDateString\('en-IN', \{ timeZone: 'Asia\/Kolkata' \}\)/);
  assert.equal(new Date('2026-10-06T20:26:08.678Z').toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }), '7/10/2026');
});
