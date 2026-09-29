import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
const { default: app } = await import('./app.js');
const { Business, Product, RestaurantOrder, Coupon } = await import('./models/index.js');

const restaurant = { id: 72, slug: 'test-restaurant', name: 'Test restaurant', active: true, storeType: 'restaurant', tableCount: 3, isOpen: true };
const retail = { ...restaurant, storeType: 'retail' };
const product = { id: 91, businessId: 72, name: 'Dal', price: 125, stock: 4, active: true };

test('restaurant ordering handles all three types and rejects invalid or cross-store items', async () => {
  const old = [Business.findOne, Product.findAll, RestaurantOrder.create, Coupon.findOne];
  Coupon.findOne = async ({ where }) => where.code === 'SAVE10' ? { code: 'SAVE10', percentOff: 10 } : null;
  const created = [];
  Business.findOne = async ({ where }) => where.slug === 'test-restaurant' ? restaurant : where.slug === 'retail-store' ? retail : null;
  Product.findAll = async ({ where }) => where.businessId === 72 && where.id[Object.getOwnPropertySymbols(where.id)[0]].includes(product.id) ? [product] : [];
  RestaurantOrder.create = async payload => { created.push(payload); return { id: 900 + created.length, status: 'new' }; };
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/public/stores`;
  const post = (slug, payload) => fetch(`${base}/${slug}/restaurant-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const items = [{ id: 91, qty: 2 }];
  try {
    let r = await post('test-restaurant', { orderType: 'dine-in', tableNumber: 2, items });
    assert.equal(r.status, 201); assert.equal((await r.json()).total, 250); assert.equal(created[0].tableNumber, 2); assert.equal(created[0].customerPhone, null);
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
    assert.equal(discounted.status, 201); assert.deepEqual(await discounted.json(), { orderId:904, status:'new', subtotal:250, discount:25, total:225 });
    assert.equal(created[3].couponCode, 'SAVE10');
    discounted = await post('test-restaurant', { orderType:'dine-in', tableNumber:1, items, couponCode:'UNKNOWN' });
    assert.equal(discounted.status, 400);
    assert.equal(created.length, 4);
  } finally {
    [Business.findOne, Product.findAll, RestaurantOrder.create, Coupon.findOne] = old;
    await new Promise(resolve => server.close(resolve));
  }
});
