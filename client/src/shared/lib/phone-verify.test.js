import test from 'node:test';
import assert from 'node:assert/strict';
const load = async host => { globalThis.window = { location: { hostname: host } }; globalThis.localStorage = { getItem: () => null, setItem() {} }; return import(`./phone-verify.js?h=${host}`); };

test('credentials are used for verify and order calls on the platform site only', async () => {
  const platform = await load('digitalshop.website');
  for (const p of ['/public/stores/s/verify/session', '/public/stores/s/restaurant-orders', '/public/stores/s/enquire-cart', '/public/stores/s/products/4/enquire']) assert.equal(platform.needsCredentials(p), true, p);
  assert.equal(platform.needsCredentials('/public/stores/s'), false);
  const custom = await load('shop.example.com');
  for (const p of ['/public/stores/s/verify/session', '/public/stores/s/restaurant-orders', '/public/stores/s/enquire-cart']) assert.equal(custom.needsCredentials(p), false, p);
});
test('normalizePhone matches the server rules', async () => {
  const { normalizePhone } = await load('digitalshop.website');
  assert.equal(normalizePhone('98765 43210'), '919876543210'); assert.equal(normalizePhone('+91 98765-43210'), '919876543210'); assert.equal(normalizePhone('12'), '');
});
