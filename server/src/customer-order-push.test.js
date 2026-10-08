import test from 'node:test';
import assert from 'node:assert/strict';
import { customerOrderPushTitle } from './customer-order-push.js';
import fs from 'node:fs';
test('status push uses store-facing order number instead of internal key', () => {
  assert.equal(customerOrderPushTitle({name:'Shop'}, {id:9,orderNumber:4}), 'Order #4 at Shop');
});
test('legacy orders retain database-key fallback', () => {
  assert.equal(customerOrderPushTitle({name:'Shop'}, {id:9}), 'Order #9 at Shop');
});
test('status routes preserve order-specific subscription isolation and change gate', () => {
  const source=fs.readFileSync(new URL('./routes/owner.js',import.meta.url),'utf8');
  assert.match(source,/where: \{ orderType: kind, orderId: order.id, businessId: store.id \}/);
  assert.match(source,/title: customerOrderPushTitle\(store, order\)/);
  assert.match(source,/if \(statusChanged\) await notifyOrderSubscribers\(req.store, 'lead', lead\)/);
  assert.match(source,/if \(changed\) await notifyOrderSubscribers\(req.store, 'restaurant', order\)/);
  assert.match(source,/url: sub.returnPath/);
});
