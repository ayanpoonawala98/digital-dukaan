process.env.DISABLE_ABUSE_LIMITS = '1';
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
const { default: app } = await import('../../app.js');
const { Business, Product, RestaurantOrder, OrderPushSubscription, Coupon } = await import('../../models/index.js');
const { default: jwt } = await import('jsonwebtoken');

const restaurant = { id: 72, slug: 'test-restaurant', name: 'Test restaurant', active: true, storeType: 'restaurant', tableCount: 3, isOpen: true };
const retail = { ...restaurant, storeType: 'retail' };
const product = { id: 91, businessId: 72, name: 'Dal', price: 125, stock: 4, active: true };

test('restaurant ordering handles all three types and rejects invalid or cross-store items', async () => {
  const old = [Business.findOne, Product.findAll, RestaurantOrder.create, Coupon.findOne];
  const [oldUpsert, oldDestroy, oldFindAll] = [OrderPushSubscription.findOrCreate, OrderPushSubscription.destroy, OrderPushSubscription.findAll];
  RestaurantOrder.findOne = async ({ where }) => where.id >= 901 && where.id <= 904 ? { id: where.id, businessId: 72, status: 'new' } : null;
  const oldFindOne = RestaurantOrder.findOne;
  Coupon.findOne = async ({ where }) => where.code === 'SAVE10' ? { code: 'SAVE10', percentOff: 10 } : null;
  const created = [];
  Business.findOne = async ({ where }) => where.slug === 'test-restaurant' ? restaurant : where.slug === 'retail-store' ? retail : null;
  Product.findAll = async ({ where }) => where.businessId === 72 && where.id[Object.getOwnPropertySymbols(where.id)[0]].includes(product.id) ? [product] : [];
  RestaurantOrder.create = async payload => { created.push(payload); return { id: 900 + created.length, status: 'new' }; };
  const upserted = [], destroyed = [];
  OrderPushSubscription.findOrCreate = async ({ where, defaults }) => { upserted.push({ ...where, ...defaults }); return [{ update: async () => {} }, true]; };
  OrderPushSubscription.destroy = async ({ where }) => { destroyed.push(where); };
  OrderPushSubscription.findAll = async () => [];
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/public/stores`;
  const post = (slug, payload) => fetch(`${base}/${slug}/restaurant-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const items = [{ id: 91, qty: 2 }];
  try {
    let r = await post('test-restaurant', { orderType: 'dine-in', tableNumber: 2, items });
    assert.equal(r.status, 201); assert.equal((await r.json()).total, 250); assert.equal(created[0].tableNumber, 2); assert.equal(created[0].customerPhone, null);
    restaurant.minOrder = 300;
    r = await post('test-restaurant', { orderType: 'dine-in', tableNumber: 1, items });
    assert.equal(r.status, 400); assert.match((await r.json()).error, /Minimum order/);
    restaurant.minOrder = 0;
    product.customFields = [{id:'spice',label:'Spice',type:'select',required:true,options:['Mild','Hot']}];
    r = await post('test-restaurant', { orderType:'dine-in',tableNumber:1,items });
    assert.equal(r.status,400);
    r = await post('test-restaurant', { orderType:'dine-in',tableNumber:1,items:[{id:91,qty:2,answers:{spice:'Other'}}] });
    assert.equal(r.status,400);
    r = await post('test-restaurant', { orderType:'dine-in',tableNumber:1,items:[{id:91,qty:2,answers:{spice:'Hot'}}] });
    assert.equal(r.status,201);assert.deepEqual(created.pop().items[0].answers,[{label:'Spice',value:'Hot'}]);
    product.customFields = [];
    r = await post('test-restaurant', { orderType: 'takeaway', customerName: '  Ayan  ', customerPhone: '9876543210', items });
    assert.equal(r.status, 201); assert.equal(created[1].customerName, 'Ayan'); assert.equal(created[1].tableNumber, null);
    r = await post('test-restaurant', { orderType: 'delivery', customerName: 'Ayan', customerPhone: '9876543210', deliveryAddress: '  10 Main Rd  ', items });
    assert.equal(r.status, 201); assert.equal(created[2].deliveryAddress, '10 Main Rd');
    for (const payload of [
      { orderType: 'dine-in', tableNumber: 4, items },
      { orderType: 'takeaway', customerName: 'Ayan', items },
      { orderType: 'delivery', customerName: 'Ayan', customerPhone: '9876543210', items },
      { orderType: 'dine-in', tableNumber: 1, items: [{ id: 999, qty: 1 }] },
      { orderType: 'dine-in', tableNumber: 1, items: [{ id: 91, qty: 5 }] },
      { orderType: 'dine-in', tableNumber: 1, items: [{ id: 91, qty: 1 }, { id: 91, qty: 1 }] }
    ]) assert.equal((await post('test-restaurant', payload)).status, 400);
    assert.equal((await post('retail-store', { orderType: 'dine-in', tableNumber: 1, items })).status, 404);
    let discounted = await post('test-restaurant', { orderType:'dine-in', tableNumber:1, items, couponCode:'save10' });
    assert.equal(discounted.status, 201); const result = await discounted.json(); assert.equal(typeof result.trackingToken, 'string'); const { trackingToken, ...details } = result; assert.deepEqual(details, { orderId:904, status:'new', subtotal:250, discount:25, deliveryFee:0, estimateMinutes:null, total:225 });
    assert.equal(created[3].couponCode, 'SAVE10');
    discounted = await post('test-restaurant', { orderType:'dine-in', tableNumber:1, items, couponCode:'UNKNOWN' });
    assert.equal(discounted.status, 400);
    assert.equal(created.length, 4);
    // Tracking token gates the order status read and push subscription management.
    const token = jwt.sign({ orderId: 904, businessId: 72 }, process.env.JWT_SECRET, { audience: 'restaurant-tracking', issuer: 'digital-dukaan', expiresIn: '30d' });
    const badToken = jwt.sign({ orderId: 903, businessId: 72 }, process.env.JWT_SECRET, { audience: 'restaurant-tracking', issuer: 'digital-dukaan' });
    let r2 = await fetch(`${base}/test-restaurant/restaurant-orders/904`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(r2.status, 200); assert.equal((await r2.json()).order.status, 'new');
    assert.equal((await fetch(`${base}/test-restaurant/restaurant-orders/904`, { headers: { authorization: `Bearer ${badToken}` } })).status, 404);
    assert.equal((await fetch(`${base}/test-restaurant/restaurant-orders/904`)).status, 404);
    const sub = { endpoint: 'https://fcm.googleapis.com/sub/abc', keys: { p256dh: 'p', auth: 'a' }, returnPath: '/store/test-restaurant/order/904#token=' + token };
    r2 = await fetch(`${base}/test-restaurant/restaurant-orders/904/push-subscription`, { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(sub) });
    assert.equal(r2.status, 201); assert.equal(upserted.length, 1); assert.equal(upserted[0].orderId, 904); assert.equal(upserted[0].endpoint, sub.endpoint); assert.equal(upserted[0].orderType, 'restaurant'); assert.ok(upserted[0].returnPath.endsWith('#token=' + token));
    assert.equal((await fetch(`${base}/test-restaurant/restaurant-orders/904/push-subscription`, { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: `Bearer ${badToken}` }, body: JSON.stringify(sub) })).status, 404);
    r2 = await fetch(`${base}/test-restaurant/restaurant-orders/904/push-subscription`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    assert.equal(r2.status, 204); assert.equal(destroyed.length, 1); assert.equal(destroyed[0].endpoint, sub.endpoint);
    RestaurantOrder.findOne = oldFindOne;
  } finally {
    [Business.findOne, Product.findAll, RestaurantOrder.create, Coupon.findOne] = old;
    OrderPushSubscription.findOrCreate = oldUpsert; OrderPushSubscription.destroy = oldDestroy; OrderPushSubscription.findAll = oldFindAll;
    await new Promise(resolve => server.close(resolve));
  }
});
