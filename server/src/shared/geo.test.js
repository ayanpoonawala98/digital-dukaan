import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm } from './utils/geo.js';

test('haversine: zero distance, one degree of longitude at the equator, Mumbai to Thane', () => {
  assert.equal(haversineKm(19, 72, 19, 72), 0);
  assert.ok(Math.abs(haversineKm(0, 0, 0, 1) - 111.19) < 0.05);
  assert.ok(Math.abs(haversineKm(19.076, 72.8777, 19.2183, 72.9781) - 19.02) < 0.1);
  assert.ok(Math.abs(haversineKm(19.076, 72.8777, 19.2183, 72.9781) - haversineKm(19.2183, 72.9781, 19.076, 72.8777)) < 1e-9);
});
