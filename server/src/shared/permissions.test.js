import test from 'node:test';
import assert from 'node:assert/strict';
import { effective, clean, staffAllowed, LEGACY } from './permissions.js';

test('existing staff (null permissions) keep the legacy access', () => {
  const p = effective({ permissions: null });
  assert.deepEqual(p, LEGACY);
  assert.ok(staffAllowed(p, 'GET', 'overview'));
  assert.ok(staffAllowed(p, 'PATCH', 'restaurant-orders/4'));
  assert.ok(staffAllowed(p, 'POST', 'whatsapp-cloud/send'));
  assert.ok(staffAllowed(p, 'POST', 'products/import/commit'));
  assert.ok(!staffAllowed(p, 'PATCH', 'products/4'));
  assert.ok(!staffAllowed(p, 'GET', 'leads'));
  assert.ok(!staffAllowed(p, 'GET', 'payments'));
});
test('permissions switch routes on and off', () => {
  const none = effective({ permissions: [] });
  assert.ok(staffAllowed(none, 'GET', 'overview'));
  assert.ok(!staffAllowed(none, 'GET', 'restaurant-orders'));
  assert.ok(!staffAllowed(none, 'PATCH', 'restaurant-orders/1'));
  assert.ok(!staffAllowed(none, 'POST', 'whatsapp-cloud/send'));
  const prod = effective({ permissions: ['products'] });
  assert.ok(staffAllowed(prod, 'GET', 'products'));
  assert.ok(staffAllowed(prod, 'PATCH', 'products/9'));
  assert.ok(!staffAllowed(prod, 'DELETE', 'products/9'));
  assert.ok(staffAllowed(prod, 'POST', 'products'));
  assert.ok(staffAllowed(prod, 'POST', 'categories'));
  assert.ok(!staffAllowed(prod, 'DELETE', 'categories/1'));
  assert.ok(!staffAllowed(prod, 'GET', 'coupons'));
  const cp = effective({ permissions: ['coupons'] });
  assert.ok(staffAllowed(cp, 'POST', 'coupons') && staffAllowed(cp, 'PATCH', 'coupons/2') && !staffAllowed(cp, 'DELETE', 'coupons/2') && !staffAllowed(cp, 'POST', 'products'));
  const leads = effective({ permissions: ['leads'] });
  assert.ok(staffAllowed(leads, 'GET', 'leads'));
  assert.ok(staffAllowed(leads, 'POST', 'leads/3/status'));
  assert.ok(!staffAllowed(leads, 'POST', 'leads/3/payment-link'));
  assert.ok(!staffAllowed(leads, 'GET', 'coupons'));
});
test('clean rejects unknown keys and non-arrays', () => {
  assert.equal(clean(['admin']), null);
  assert.equal(clean('products'), null);
  assert.deepEqual(clean(['leads', 'products', 'leads']), ['products', 'leads']);
});
test('kitchen can mark dishes sold out and print KOTs with order permissions only', () => {
  const view = effective({ permissions: ['orders_view'] }), act = effective({ permissions: ['orders_view', 'order_status'] });
  assert.ok(staffAllowed(view, 'GET', 'menu-availability'));
  assert.ok(!staffAllowed(view, 'POST', 'menu-availability/5'));
  assert.ok(!staffAllowed(view, 'POST', 'restaurant-orders/5/kot'));
  assert.ok(staffAllowed(act, 'POST', 'menu-availability/5'));
  assert.ok(staffAllowed(act, 'POST', 'restaurant-orders/5/kot'));
});
test('retail/service tickets need the leads permission', () => {
  assert.ok(staffAllowed(effective({ permissions: ['leads'] }), 'POST', 'leads/3/kot'));
  assert.ok(!staffAllowed(effective({ permissions: ['orders_view', 'order_status'] }), 'POST', 'leads/3/kot'));
});

test('customers permission: view/add/edit/push per customer only; everything risky stays owner-only', () => {
  const none = ['orders_view', 'order_status', 'whatsapp', 'import', 'billing'], cust = [...none, 'customers'];
  for (const [m, r] of [['GET', 'customers'], ['GET', 'customers/5'], ['POST', 'customers'], ['PATCH', 'customers/5'], ['POST', 'customers/5/push'], ['GET', 'customers/channels'], ['GET', 'customers/messages']]) {
    assert.equal(staffAllowed(none, m, r), false, `${m} ${r} without key`);
    assert.equal(staffAllowed(cust, m, r), true, `${m} ${r} with key`);
  }
  for (const [m, r] of [['DELETE', 'customers/5'], ['POST', 'customers/broadcast/push'], ['POST', 'customers/5/message'], ['POST', 'customers/backfill'], ['DELETE', 'customers/5/devices/2'], ['POST', 'customers/import/undo'], ['GET', 'customers/5/anything']]) assert.equal(staffAllowed(cust, m, r), false, `${m} ${r}`);
  assert.equal(staffAllowed(['import'], 'POST', 'customers/import/preview'), true);
  assert.equal(effective({ permissions: null }).includes('customers'), false);
});

test('staff can never delete staff accounts, even with every permission', () => {
  const all = effective(['products','orders_view','orders_update','coupons','customers','billing']);
  assert.equal(staffAllowed(all, 'DELETE', 'staff/5'), false);
  assert.equal(staffAllowed(all, 'PATCH', 'staff/5'), false);
});
test('owner staff delete route is owner-only, scoped to this owner and store, and clears alert devices first', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../routes/owner.js', import.meta.url), 'utf8');
  const i = src.indexOf("r.delete('/:storeId/staff/:id'");
  assert.ok(i > 0);
  const block = src.slice(i, i + 900);
  assert.match(block, /ownerOnly/);
  assert.match(block, /managerId:req\.user\.id, staffBusinessId:bid\(req\), role:'staff'/);
  assert.ok(block.indexOf('OwnerPushSubscription.destroy') < block.indexOf('staff.destroy'));
});
