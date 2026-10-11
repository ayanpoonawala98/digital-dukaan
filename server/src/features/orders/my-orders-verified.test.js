process.env.DISABLE_ABUSE_LIMITS = '1';
process.env.STOREFRONT_VERIFY_WHATSAPP_ENABLED = 'true';
process.env.STOREFRONT_VERIFY_STORE_SLUGS = 'shop';
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
const { default: app } = await import('../../app.js');
const { Business, Lead, RestaurantOrder, OrderPushSubscription } = await import('../../models/index.js');
const { PlatformSession, PlatformIdentity } = await import('../whatsapp/storefront-verify.js');
const COOKIE = 'ds_id=' + 'A'.repeat(43);
const mk = (id, businessId, customerPhone, extra = {}) => ({ id, businessId, status: 'confirmed', productName: 'Tee', price: 100, items: [{ name: 'Tee', qty: 1, price: 100 }], customerPhone, customerName: 'Secret Name', address: '12 Private Road', createdAt: new Date(2026, 9, id), ...extra });

test('My orders for a verified session lists only orders with that exact verified phone, status and items only', async () => {
  const saved = { b: Business.findOne, l: Lead.findAll, r: RestaurantOrder.findAll, o: OrderPushSubscription.findAll, ps: PlatformSession.findOne, pi: PlatformIdentity.findOne };
  const shop = { id: 5, slug: 'shop', name: 'Shop', storeType: 'retail', active: true }, other = { id: 6, slug: 'other', name: 'Other', storeType: 'retail', active: true };
  Business.findOne = async ({ where }) => ({ shop, other }[where.slug] || null);
  const rows = [mk(1, 5, '+91 98765 43210'), mk(2, 5, '9876543210'), mk(3, 5, '+1 987 654 3210'), mk(4, 5, '9000000000'), mk(5, 6, '9876543210')];
  Lead.findAll = async ({ where }) => rows.filter(r => r.businessId === where.businessId && (!where.id || where.id[Object.getOwnPropertySymbols(where.id)[0]].includes(r.id)));
  RestaurantOrder.findAll = async () => []; OrderPushSubscription.findAll = async () => [];
  let cookieOk = true;
  PlatformSession.findOne = async () => (cookieOk ? { identityId: 1 } : null); PlatformIdentity.findOne = async () => ({ id: 1, phone: '919876543210' });
  const server = app.listen(0), base = `http://127.0.0.1:${server.address().port}/api/public/stores`;
  const post = (slug, cookie) => fetch(`${base}/${slug}/my-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({}) }).then(r => r.json());
  try {
    const v = await post('shop', COOKIE);
    assert.deepEqual(v.orders.map(o => o.id).sort(), [1, 2], 'same number in two formats; +1 look-alike, other number and other store excluded');
    assert.deepEqual(v.verified, { phoneEnding: '3210' });
    assert.ok(v.orders.every(o => o.path?.includes('#token=')), 'each gets a tracking link');
    const text = JSON.stringify(v); assert.ok(!/Secret Name|Private Road|98765|919876543210/.test(text), 'no address, name or phone in the response');
    const anon = await post('shop'); assert.deepEqual(anon.orders, []); assert.equal(anon.verified, null);
    cookieOk = false; assert.deepEqual((await post('shop', COOKIE)).orders, [], 'no valid session, no phone lookup'); cookieOk = true;
    const off = await post('other', COOKIE); assert.deepEqual(off.orders, [], 'store outside the verification list is untouched'); assert.equal(off.verified, null);
  } finally {
    server.close(); Business.findOne = saved.b; Lead.findAll = saved.l; RestaurantOrder.findAll = saved.r; OrderPushSubscription.findAll = saved.o; PlatformSession.findOne = saved.ps; PlatformIdentity.findOne = saved.pi;
  }
});
