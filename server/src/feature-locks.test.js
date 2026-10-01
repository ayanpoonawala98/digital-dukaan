import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
const { default: app } = await import('./app.js');
const { Business } = await import('./models/index.js');
const { default: jwt } = await import('jsonwebtoken');
const { LOCKABLE_KEYS, featureForOwnerRoute, isLocked, locksOf } = await import('./feature-locks.js');

const sign = sub => jwt.sign({ sub }, process.env.JWT_SECRET);
// auth middleware loads the user from the DB; stub it away from Postgres.
const users = {
  1: { id: 1, name: 'Super', role: 'superadmin', active: true },
  2: { id: 2, name: 'Owner', role: 'owner', active: true },
  3: { id: 3, name: 'Staff', role: 'staff', active: true, managerId: 2, staffBusinessId: 5 }
};

test('route mapping covers every dashboard feature and skips essentials', () => {
  assert.equal(featureForOwnerRoute('GET', '/products'), 'products');
  assert.equal(featureForOwnerRoute('POST', '/categories'), 'products');
  assert.equal(featureForOwnerRoute('POST', '/import/vyapar'), 'products');
  assert.equal(featureForOwnerRoute('GET', '/leads'), 'leads');
  assert.equal(featureForOwnerRoute('POST', '/leads/9/status'), 'leads');
  assert.equal(featureForOwnerRoute('GET', '/export/vyapar.csv'), 'leads');
  assert.equal(featureForOwnerRoute('GET', '/customers'), 'customers');
  assert.equal(featureForOwnerRoute('GET', '/sales-summary'), 'sales');
  assert.equal(featureForOwnerRoute('POST', '/coupons'), 'coupons');
  assert.equal(featureForOwnerRoute('POST', '/referrals/2/redeem'), 'referrals');
  assert.equal(featureForOwnerRoute('GET', '/staff'), 'staff');
  assert.equal(featureForOwnerRoute('PATCH', '/restaurant-orders/4'), 'restaurant');
  assert.equal(featureForOwnerRoute('POST', '/push-broadcast'), 'notifications');
  assert.equal(featureForOwnerRoute('GET', '/whatsapp-cloud/status'), 'whatsappCloud');
  assert.equal(featureForOwnerRoute('PATCH', '/business'), 'settings');
  assert.equal(featureForOwnerRoute('GET', '/overview'), null);
  assert.equal(featureForOwnerRoute('POST', '/upload'), null);
  assert.equal(featureForOwnerRoute('GET', '/business'), null, 'reading settings stays open');
});

test('locksOf and isLocked read only boolean-true flags', () => {
  assert.deepEqual(locksOf(null), {});
  assert.deepEqual(locksOf({ featureLocks: 'junk' }), {});
  assert.equal(isLocked({ featureLocks: { coupons: true } }, 'coupons'), true);
  assert.equal(isLocked({ featureLocks: { coupons: true } }, 'leads'), false);
  assert.equal(isLocked({ featureLocks: { coupons: 1 } }, 'coupons'), false);
});

test('superadmin sets locks and locked owner/staff routes are rejected server-side', async () => {
  const savedUser = (await import('./models/index.js')).User;
  const origFindByPkUser = savedUser.findByPk;
  savedUser.findByPk = async id => users[id] ? { ...users[id] } : null;

  const store = {
    id: 5, ownerId: 2, slug: 'qa-lock', name: 'QA Lock Store', storeType: 'retail', active: true, deletedAt: null,
    featureLocks: {},
    update: async function (changes) { Object.assign(this, changes); return this; }
  };
  const origFindOne = Business.findOne;
  const origFindByPk = Business.findByPk;
  Business.findOne = async ({ where }) => (Number(where.id) === store.id && Number(where.ownerId) === store.ownerId && !where.deletedAt ? store : null);
  Business.findByPk = async id => (Number(id) === store.id ? store : null);

  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = (path, method = 'GET', body, sub) => fetch(base + path, { method, headers: { ...(sub ? { authorization: `Bearer ${sign(sub)}` } : {}), 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    // Anonymous and non-superadmin cannot read or change locks.
    assert.equal((await call(`/admin/businesses/${store.id}/feature-locks`)).status, 401);
    assert.equal((await call(`/admin/businesses/${store.id}/feature-locks`, 'GET', null, 2)).status, 403);
    assert.equal((await call(`/admin/businesses/${store.id}/feature-locks`, 'PATCH', { feature: 'coupons', locked: true }, 2)).status, 403);
    // Superadmin reads the catalog and sets a lock with validation.
    let res = await call(`/admin/businesses/${store.id}/feature-locks`, 'GET', null, 1);
    assert.equal(res.status, 200);
    const catalog = await res.json();
    assert.deepEqual(catalog.features.map(f => f.key), LOCKABLE_KEYS);
    assert.deepEqual(catalog.locks, {});
    assert.equal((await call(`/admin/businesses/${store.id}/feature-locks`, 'PATCH', { feature: 'nonsense', locked: true }, 1)).status, 400);
    assert.equal((await call(`/admin/businesses/${store.id}/feature-locks`, 'PATCH', { feature: 'coupons' }, 1)).status, 400);
    res = await call(`/admin/businesses/${store.id}/feature-locks`, 'PATCH', { feature: 'coupons', locked: true }, 1);
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).locks, { coupons: true });

    // Locked owner route is rejected; other routes still resolve past the lock check.
    res = await call(`/owner/${store.id}/coupons`, 'GET', null, 2);
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /locked by the platform admin/i);
    res = await call(`/owner/${store.id}/coupons`, 'POST', { code: 'SAVE10', percentOff: 10 }, 2);
    assert.equal(res.status, 403);
    // Settings PATCH locked independently.
    await call(`/admin/businesses/${store.id}/feature-locks`, 'PATCH', { feature: 'settings', locked: true }, 1);
    res = await call(`/owner/${store.id}/business`, 'PATCH', { name: 'Rename attempt' }, 2);
    assert.equal(res.status, 403);
    // Unlocking restores access (coupons GET reaches the DB layer, not the lock 403).
    await call(`/admin/businesses/${store.id}/feature-locks`, 'PATCH', { feature: 'coupons', locked: false }, 1);
    res = await call(`/owner/${store.id}/coupons`, 'GET', null, 2);
    assert.notEqual(res.status, 403);
    // Staff on the same store is blocked by the lock too (restaurant lock).
    store.storeType = 'restaurant';
    await call(`/admin/businesses/${store.id}/feature-locks`, 'PATCH', { feature: 'restaurant', locked: true }, 1);
    res = await call(`/owner/${store.id}/restaurant-orders`, 'GET', null, 3);
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /locked by the platform admin/i);
  } finally {
    Business.findOne = origFindOne;
    Business.findByPk = origFindByPk;
    savedUser.findByPk = origFindByPkUser;
    await new Promise(resolve => server.close(resolve));
  }
});

test('public coupon application honours the lock without touching unlocked stores', async () => {
  const { Product } = await import('./models/index.js');
  const origFindOne = Business.findOne;
  const origProductFindOne = Product.findOne;
  const lockedStore = { id: 7, slug: 'locked-shop', name: 'Locked', active: true, deletedAt: null, storeType: 'retail', featureLocks: { coupons: true }, minOrder: 0, deliveryCharge: 0, freeDeliveryAbove: null };
  const openStore = { id: 8, slug: 'open-shop', name: 'Open', active: true, deletedAt: null, storeType: 'retail', featureLocks: {}, minOrder: 0, deliveryCharge: 0, freeDeliveryAbove: null };
  Business.findOne = async ({ where }) => ({ 'locked-shop': lockedStore, 'open-shop': openStore })[where.slug] || null;
  Product.findOne = async ({ where }) => (Number(where.id) === 1 ? { id: 1, businessId: where.businessId, name: 'Test item', price: 100, stock: null } : null);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/public/stores`;
  try {
    const res = await fetch(`${base}/locked-shop/enquire-cart`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ id: 1, qty: 1 }], couponCode: 'SAVE10' }) });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /coupons are currently unavailable/i);
    // An unlocked store reaches coupon lookup, never the lock rejection.
    const other = await fetch(`${base}/open-shop/enquire-cart`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ id: 1, qty: 1 }], couponCode: 'SAVE10' }) });
    assert.notEqual((await other.json()).error, 'Coupons are currently unavailable for this store');
  } finally {
    Business.findOne = origFindOne;
    Product.findOne = origProductFindOne;
    await new Promise(resolve => server.close(resolve));
  }
});
