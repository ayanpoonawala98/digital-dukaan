process.env.DISABLE_ABUSE_LIMITS = '1';
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
const { default: app } = await import('../../app.js');
const m = await import('../../models/index.js');
const { sequelize } = await import('../../config/db.js');
const { OrderNetworkSignal } = await import('../../features/orders/network-flags.js');
const { TableHold, TableBill } = await import('../../features/restaurant/table-bills.js');

const restaurant = { id: 72, slug: 'flag-restaurant', name: 'Flag restaurant', active: true, storeType: 'restaurant', tableCount: 3, isOpen: true };
const retail = { id: 73, slug: 'flag-retail', name: 'Flag retail', active: true, storeType: 'retail', isOpen: true, whatsapp: '919999999999', notifySettings: {} };
const dish = { id: 91, businessId: 72, name: 'Dal', price: 125, stock: 40, active: true };
const ring = { id: 92, businessId: 73, name: 'Ring', price: 150, stock: 40, imageUrl: '' };

test('network burst flags the fifth order, dine-in is never signalled, and a signal failure never blocks an order', async () => {
  const olds = [m.Business.findOne, m.Product.findAll, m.Product.findOne, m.RestaurantOrder.create, m.RestaurantOrder.update, m.Lead.create, m.Lead.update, m.Coupon.findOne, m.OrderPushSubscription.findOrCreate, m.OrderPushSubscription.destroy, m.OrderPushSubscription.findAll, OrderNetworkSignal.create, OrderNetworkSignal.count, OrderNetworkSignal.destroy, OrderNetworkSignal.sync, TableBill.sync, TableHold.sync, TableHold.findOne, sequelize.query];
  m.Business.findOne = async ({ where }) => where.slug === 'flag-restaurant' ? restaurant : where.slug === 'flag-retail' ? retail : null;
  m.Product.findAll = async () => [dish];
  m.Product.findOne = async () => ring;
  m.RestaurantOrder.create = async p => ({ id: 500, status: 'new', ...p });
  const rUpdates = [], lUpdates = [];
  m.RestaurantOrder.update = async (v, w) => { rUpdates.push([v, w]); return [1]; };
  m.Lead.create = async p => ({ id: 600, orderNumber: 2, ...p });
  m.Lead.update = async (v, w) => { lUpdates.push([v, w]); return [1]; };
  m.Coupon.findOne = async () => null;
  m.OrderPushSubscription.findOrCreate = async () => [{ update: async () => {} }, true];
  m.OrderPushSubscription.destroy = async () => {};
  m.OrderPushSubscription.findAll = async () => [];
  const signals = [];
  let count = 0;
  OrderNetworkSignal.create = async p => { signals.push(p); count += 1; return p; };
  OrderNetworkSignal.count = async () => count;
  OrderNetworkSignal.destroy = async () => 0;
  OrderNetworkSignal.sync = async () => {}; TableBill.sync = async () => {}; TableHold.sync = async () => {}; TableHold.findOne = async () => null;
  sequelize.query = async () => [];
  const server = app.listen(0);
  const port = server.address().port;
  const post = (path, body) => fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const rBase = `/api/public/stores/flag-restaurant/restaurant-orders`;
  try {
    // four takeaway orders from the same network: no flag
    for (let i = 0; i < 4; i++) {
      const r = await post(rBase, { orderType: 'takeaway', customerName: 'A', customerPhone: '+91 98765 00000', items: [{ id: 91, qty: 1 }] });
      assert.equal(r.status, 201);
    }
    assert.equal(signals.length, 4); assert.equal(rUpdates.length, 0);
    // fifth trips the flag: the row is marked, the order still succeeds
    let r = await post(rBase, { orderType: 'takeaway', customerName: 'A', customerPhone: '+91 98765 00000', items: [{ id: 91, qty: 1 }] });
    assert.equal(r.status, 201);
    assert.equal(rUpdates.length, 1); assert.deepEqual(rUpdates[0][0], { networkFlag: true }); assert.deepEqual(rUpdates[0][1], { where: { id: 500 } });
    assert.equal(signals[0].kind, 'restaurant'); assert.ok(signals[0].networkKey); assert.ok(!JSON.stringify(signals[0]).includes('127.0.0'), 'no raw IP stored');
    // dine-in is excluded: no signal, no flag
    const before = signals.length;
    r = await post(rBase, { orderType: 'dine-in', tableNumber: 2, items: [{ id: 91, qty: 1 }] });
    assert.equal(r.status, 201); assert.equal(signals.length, before);
    // signal failure never blocks an order
    OrderNetworkSignal.create = async () => { throw new Error('db down'); };
    r = await post(rBase, { orderType: 'takeaway', customerName: 'A', customerPhone: '+91 98765 00000', items: [{ id: 91, qty: 1 }] });
    assert.equal(r.status, 201); assert.equal(rUpdates.length, 1);
    // lead (retail enquiry) path flags too
    OrderNetworkSignal.create = async p => { signals.push(p); count += 1; return p; };
    r = await post(`/api/public/stores/flag-retail/products/92/enquire`, { qty: 2 });
    assert.equal(r.status, 201); assert.equal(lUpdates.length, 1); assert.deepEqual(lUpdates[0][0], { networkFlag: true });
    assert.equal(signals.at(-1).kind, 'lead');
  } finally {
    [m.Business.findOne, m.Product.findAll, m.Product.findOne, m.RestaurantOrder.create, m.RestaurantOrder.update, m.Lead.create, m.Lead.update, m.Coupon.findOne, m.OrderPushSubscription.findOrCreate, m.OrderPushSubscription.destroy, m.OrderPushSubscription.findAll, OrderNetworkSignal.create, OrderNetworkSignal.count, OrderNetworkSignal.destroy, OrderNetworkSignal.sync, TableBill.sync, TableHold.sync, TableHold.findOne, sequelize.query] = olds;
    await new Promise(resolve => server.close(resolve));
  }
});

test('threshold override honours NETWORK_FLAG_THRESHOLD', async () => {
  process.env.NETWORK_FLAG_THRESHOLD = '2';
  const olds = [m.Business.findOne, m.Product.findAll, m.RestaurantOrder.create, m.RestaurantOrder.update, m.Coupon.findOne, m.OrderPushSubscription.findOrCreate, m.OrderPushSubscription.findAll, OrderNetworkSignal.create, OrderNetworkSignal.count, OrderNetworkSignal.destroy, OrderNetworkSignal.sync, sequelize.query];
  m.Business.findOne = async () => restaurant;
  m.Product.findAll = async () => [dish];
  m.RestaurantOrder.create = async p => ({ id: 500, status: 'new', ...p });
  const rUpdates = [];
  m.RestaurantOrder.update = async (v, w) => { rUpdates.push([v, w]); return [1]; };
  m.Coupon.findOne = async () => null;
  m.OrderPushSubscription.findOrCreate = async () => [{ update: async () => {} }, true];
  m.OrderPushSubscription.findAll = async () => [];
  let count = 0;
  OrderNetworkSignal.create = async () => { count += 1; };
  OrderNetworkSignal.count = async () => count;
  OrderNetworkSignal.destroy = async () => 0; OrderNetworkSignal.sync = async () => {};
  sequelize.query = async () => [];
  const server = app.listen(0);
  const post = body => fetch(`http://127.0.0.1:${server.address().port}/api/public/stores/flag-restaurant/restaurant-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await post({ orderType: 'takeaway', customerName: 'A', customerPhone: '+91 98765 00000', items: [{ id: 91, qty: 1 }] })).status, 201);
    assert.equal(rUpdates.length, 0);
    assert.equal((await post({ orderType: 'takeaway', customerName: 'A', customerPhone: '+91 98765 00000', items: [{ id: 91, qty: 1 }] })).status, 201);
    assert.equal(rUpdates.length, 1);
  } finally {
    delete process.env.NETWORK_FLAG_THRESHOLD;
    [m.Business.findOne, m.Product.findAll, m.RestaurantOrder.create, m.RestaurantOrder.update, m.Coupon.findOne, m.OrderPushSubscription.findOrCreate, m.OrderPushSubscription.findAll, OrderNetworkSignal.create, OrderNetworkSignal.count, OrderNetworkSignal.destroy, OrderNetworkSignal.sync, sequelize.query] = olds;
    await new Promise(resolve => server.close(resolve));
  }
});
