import test from 'node:test';
import assert from 'node:assert/strict';
import { customerOrderPushTitle, statusPush, reviewPath, isFinished } from './customer-order-push.js';
import fs from 'node:fs';
test('status push uses store-facing order number instead of internal key', () => {
  assert.equal(customerOrderPushTitle({name:'Shop'}, {id:9,orderNumber:4}), 'Order #4 at Shop');
});
test('legacy orders retain database-key fallback', () => {
  assert.equal(customerOrderPushTitle({name:'Shop'}, {id:9}), 'Order #9 at Shop');
});
test('status routes preserve order-specific subscription isolation and change gate', () => {
  const source=fs.readFileSync(new URL('../../routes/owner.js',import.meta.url),'utf8');
  assert.match(source,/where: \{ orderType: kind, orderId: order.id, businessId: store.id \}/);
  assert.match(source,/statusPush\(\{ store, order, flow/);
  assert.match(source,/if \(statusChanged\) await notifyOrderSubscribers\(req.store, 'lead', lead\)/);
  assert.match(source,/if \(changed\) await notifyOrderSubscribers\(req.store, 'restaurant', order\)/);
  assert.match(source,/returnPath: sub.returnPath/);
});

test('finished orders with reviewable items double as a rate-your-order invite that deep-links to the review section', () => {
  const store = { name: 'Shop' }, path = '/store/shop/order/12#token=abc';
  const done = statusPush({ store, order: { id: 12, orderNumber: 3, status: 'delivered', items: [{ productId: 5, name: 'Tea' }] }, flow: 'restaurant', label: 'Your order was delivered.', returnPath: path, icon: 'https://ik.imagekit.io/x/l.png' });
  assert.match(done.body, /Tap to rate/); assert.equal(done.url, `${path}&review=1`); assert.equal(done.icon, 'https://ik.imagekit.io/x/l.png');
  const mid = statusPush({ store, order: { id: 12, status: 'preparing', items: [{ productId: 5 }] }, flow: 'restaurant', label: 'Your order is being prepared.', returnPath: path });
  assert.equal(mid.url, path); assert.match(mid.body, /Tap to view/);
  const nothing = statusPush({ store, order: { id: 12, status: 'delivered', items: [] }, flow: 'retail', label: 'x', returnPath: path });
  assert.equal(nothing.url, path);
  assert.equal(isFinished('services', 'completed'), true); assert.equal(isFinished('retail', 'shipped'), false); assert.equal(isFinished('restaurant', 'ready'), false);
  assert.equal(reviewPath(`${path}&review=1`), `${path}&review=1`); assert.equal(reviewPath('/x'), '/x');
});
