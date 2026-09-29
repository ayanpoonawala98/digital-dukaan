import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, whatsappUrl, validPrice, publicImageUrl } from './utils/core.js';
test('slugs normalize to shareable paths', () => assert.equal(slugify(' My Little Shop! '), 'my-little-shop'));
test('WhatsApp deep link encodes key details and photo', () => {
  const url = new URL(whatsappUrl({ whatsapp: '919876543210' }, { id: 'p1', name: 'Blue & Gold', price: 499 }, 'https://example.com/a.jpg'));
  assert.equal(url.pathname, '/919876543210');
  assert.match(url.searchParams.get('text'), /ID: p1\nName: Blue & Gold\nPrice: ₹499.00\nPhoto: https:\/\/example.com\/a.jpg/);
});
test('price validation and hosted photo URL', () => { assert.equal(validPrice(-1), false); assert.equal(validPrice(0), true); assert.equal(publicImageUrl('/uploads/a.jpg', 'https://api.example.com/'), 'https://api.example.com/uploads/a.jpg'); });

// API security regression: public signup cannot mint a login; admin APIs reject anonymous callers.
test('public signup and admin provisioning require superadmin access', async () => {
  process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
  process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
  const { default: app } = await import('./app.js');
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const signup = await fetch(`${base}/api/auth/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Unauthorized', email: 'attacker@example.org', password: 'SomePassword123' }) });
    assert.equal(signup.status, 403);
    const owner = await fetch(`${base}/api/admin/owners`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(owner.status, 401);
    const requestList = await fetch(`${base}/api/admin/shop-requests`);
    assert.equal(requestList.status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('store subdomains validate the slug and reserve platform hosts', async () => {
  const { storeDomain, storeUrl } = await import('./utils/store-domain.js');
  assert.equal(storeDomain('apna-kirana-store'), 'apna-kirana-store.digitaldukaan.space');
  assert.equal(storeUrl('trendzauras'), 'https://trendzauras.digitaldukaan.space');
  assert.throws(() => storeDomain('api'), { status: 400 });
  assert.throws(() => storeDomain('www'), { status: 400 });
  assert.throws(() => storeDomain('not.valid'), { status: 400 });
});
