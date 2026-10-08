import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
const { default: app } = await import('./app.js');
const { Business, Lead, RestaurantOrder, OrderPushSubscription } = await import('./models/index.js');
const { default: jwt } = await import('jsonwebtoken');
const { flowFor } = await import('./order-flows.js');

const retail = { id: 5, slug: 'shop', name: 'Shop', storeType: 'retail', active: true };
const services = { id: 6, slug: 'salon', name: 'Salon', storeType: 'services', active: true };
const sign = (kind, orderId, businessId) => jwt.sign({ orderId, businessId, kind }, process.env.JWT_SECRET, { audience: 'restaurant-tracking', issuer: 'digital-dukaan', expiresIn: '1d' });

test('flows are per store type', () => {
  assert.deepEqual(flowFor('retail').statuses, ['new', 'confirmed', 'packed', 'shipped', 'out-for-delivery', 'delivered', 'cancelled']);
  assert.deepEqual(flowFor('services').statuses, ['new', 'confirmed', 'in-progress', 'completed', 'cancelled']);
  assert.deepEqual(flowFor('restaurant').statuses, ['new', 'preparing', 'served', 'cancelled']);
});

test('lead tracking, My Orders, and push registration use per-order capabilities', async () => {
  const saved = { b: Business.findOne, l: [Lead.findOne, Lead.findAll], r: RestaurantOrder.findAll, s: [OrderPushSubscription.findOrCreate, OrderPushSubscription.findAll, OrderPushSubscription.destroy, OrderPushSubscription.findOne] };
  Business.findOne = async ({ where }) => ({ shop: retail, salon: services }[where.slug] || null);
  const leads = { 11: { id: 11, businessId: 5, status: 'shipped', productName: '2 items', price: 300, items: [{ name: 'Tee', qty: 2, price: 150 }], createdAt: new Date() }, 12: { id: 12, businessId: 6, status: 'in-progress', productName: 'Haircut', price: 200, items: null, createdAt: new Date() } };
  Lead.findOne = async ({ where }) => (leads[where.id] && leads[where.id].businessId === where.businessId ? leads[where.id] : null);
  Lead.findAll = async ({ where }) => Object.values(leads).filter(l => l.businessId === where.businessId);
  RestaurantOrder.findAll = async () => [];
  const registered = [], destroyed = [];
  OrderPushSubscription.findOne = async ({where}) => registered.find(r => r.businessId===where.businessId && r.orderType===where.orderType && r.orderId===where.orderId && r.endpoint===where.endpoint) || null;
  OrderPushSubscription.findOrCreate = async ({ where, defaults }) => { registered.push({ ...where, ...defaults }); return [{ update: async () => {} }, true]; };
  OrderPushSubscription.findAll = async ({ where }) => (where.endpoint === 'https://push.example.com/e1' ? [{ orderType: 'lead', orderId: 11, returnPath: '/store/shop/order/lead/11#token=x' }] : []);
  OrderPushSubscription.destroy = async ({ where }) => { destroyed.push(where); };
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/public/stores`;
  const auth = t => ({ authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  try {
    const tok = sign('lead', 11, 5);
    let r = await fetch(`${base}/shop/lead-orders/11`, { headers: auth(tok) });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.order.status, 'shipped'); assert.equal(body.store.storeType, 'retail'); assert.equal(body.order.total, 300);
    assert.equal((await fetch(`${base}/shop/lead-orders/11`)).status, 404);
    assert.equal((await fetch(`${base}/shop/lead-orders/11`, { headers: auth(sign('restaurant', 11, 5)) })).status, 404, 'restaurant token cannot read a lead');
    assert.equal((await fetch(`${base}/shop/lead-orders/12`, { headers: auth(tok) })).status, 404, 'token is bound to its order');
    assert.equal((await fetch(`${base}/salon/lead-orders/11`, { headers: auth(tok) })).status, 404, 'token is bound to its store');
    const sub = { endpoint: 'https://push.example.com/e1', keys: { p256dh: 'p', auth: 'a' } };
    r = await fetch(`${base}/shop/lead-orders/11/push-subscription`, { method: 'POST', headers: auth(tok), body: JSON.stringify(sub) });
    assert.equal(r.status, 201);
    let enrollment = await fetch(`${base}/shop/lead-orders/11/push-subscription?endpoint=${encodeURIComponent(sub.endpoint)}`, {headers:auth(tok)});
    assert.equal(enrollment.status,200);assert.equal((await enrollment.json()).enrolled,true);
    enrollment = await fetch(`${base}/shop/lead-orders/11/push-subscription?endpoint=https%3A%2F%2Fpush.example.com%2Fother`, {headers:auth(tok)});
    assert.equal((await enrollment.json()).enrolled,false);
    assert.equal((await fetch(`${base}/shop/lead-orders/11/push-subscription?endpoint=${encodeURIComponent(sub.endpoint)}`)).status,404);
    assert.equal((await fetch(`${base}/salon/lead-orders/11/push-subscription?endpoint=${encodeURIComponent(sub.endpoint)}`, {headers:auth(tok)})).status,404);
    assert.equal(registered[0].orderType, 'lead'); assert.equal(registered[0].returnPath, `/store/shop/order/lead/11#token=${tok}`);
    assert.equal((await fetch(`${base}/shop/lead-orders/11/push-subscription`, { method: 'POST', headers: auth(tok), body: JSON.stringify({ endpoint: 'http://insecure', keys: sub.keys }) })).status, 400);
    // My Orders: token-based and push-endpoint-based, never for another store's orders.
    r = await fetch(`${base}/shop/my-orders`, { method: 'POST', headers: auth(tok), body: JSON.stringify({ orders: [{ kind: 'lead', id: 11, token: tok }, { kind: 'lead', id: 12, token: sign('lead', 12, 6) }, { kind: 'lead', id: 11, token: 'junk' }] }) });
    let mine = (await r.json()).orders;
    assert.deepEqual(mine.map(o => o.id), [11]); assert.ok(mine[0].path.endsWith(`#token=${tok}`));
    r = await fetch(`${base}/shop/my-orders`, { method: 'POST', headers: auth(tok), body: JSON.stringify({ endpoint: 'https://push.example.com/e1' }) });
    mine = (await r.json()).orders;
    assert.deepEqual(mine.map(o => o.id), [11]); assert.equal(mine[0].path, '/store/shop/order/lead/11#token=x');
    r = await fetch(`${base}/shop/my-orders`, { method: 'POST', headers: auth(tok), body: JSON.stringify({ endpoint: 'https://push.example.com/unknown' }) });
    assert.deepEqual((await r.json()).orders, []);
    r = await fetch(`${base}/salon/my-orders`, { method: 'POST', headers: auth(tok), body: JSON.stringify({ orders: [{ kind: 'lead', id: 11, token: tok }] }) });
    assert.deepEqual((await r.json()).orders, [], 'tokens from another store return nothing');
    registered.length = 0;
    r = await fetch(`${base}/shop/my-orders/push-subscription`, { method: 'POST', headers: auth(tok), body: JSON.stringify({ ...sub, orders: [{ kind: 'lead', id: 11, token: tok }] }) });
    assert.equal(r.status, 201); assert.equal(registered.length, 1);
    r = await fetch(`${base}/shop/my-orders/push-subscription`, { method: 'DELETE', headers: auth(tok), body: JSON.stringify({ endpoint: sub.endpoint }) });
    assert.equal(r.status, 204); assert.equal(destroyed.at(-1).endpoint, sub.endpoint); assert.equal(destroyed.at(-1).businessId, 5);
  } finally {
    server.close();
    Business.findOne = saved.b; [Lead.findOne, Lead.findAll] = saved.l; RestaurantOrder.findAll = saved.r; [OrderPushSubscription.findOrCreate, OrderPushSubscription.findAll, OrderPushSubscription.destroy, OrderPushSubscription.findOne] = saved.s;
  }
});
