import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEdit, editLockReason, editedTotals, EditRefused, DISCOUNT_REFUSAL } from './order-edit.js';
const items = [{ productId: 1, name: 'Tikka', qty: 3, price: 100 }, { productId: 2, name: 'Naan', qty: 2, price: 20 }];
const refused = (fn, status) => assert.throws(fn, e => e instanceof EditRefused && e.status === status);
test('lowers and removes lines', () => {
  assert.deepEqual(applyEdit(items, [{ idx: 0, qty: 1 }]).map(i => i.qty), [1, 2]);
  const r = applyEdit(items, [{ idx: 1, qty: 0 }]); assert.equal(r.length, 1); assert.equal(r[0].name, 'Tikka');
  assert.equal(items[0].qty, 3); // input untouched
});
test('never raises a quantity (that is Add items)', () => refused(() => applyEdit(items, [{ idx: 1, qty: 5 }]), 400));
test('refuses removing every line, bad idx, bad qty, duplicates, no-ops', () => {
  refused(() => applyEdit(items, [{ idx: 0, qty: 0 }, { idx: 1, qty: 0 }]), 400);
  refused(() => applyEdit(items, [{ idx: 2, qty: 1 }]), 400);
  refused(() => applyEdit(items, [{ idx: -1, qty: 1 }]), 400);
  refused(() => applyEdit(items, [{ idx: 0, qty: 1.5 }]), 400);
  refused(() => applyEdit(items, [{ idx: 0, qty: 1 }, { idx: 0, qty: 2 }]), 400);
  refused(() => applyEdit(items, [{ idx: 0, qty: 3 }]), 400);
  refused(() => applyEdit(items, []), 400);
});
test('lock reasons are distinct and truthful', () => {
  assert.equal(editLockReason({ status: 'new' }), '');
  const r = o => editLockReason({ status: 'new', ...o });
  const all = [r({ billId: 5 }), r({ status: 'cancelled' }), r({ paymentStatus: 'paid' }), r({ status: 'served' }), r({ status: 'accepted' })];
  assert.equal(new Set(all).size, 5);
  assert.match(all[0], /billed/); assert.match(all[1], /cancelled/); assert.match(all[2], /paid online/); assert.match(all[4], /kitchen has already accepted/);
  for (const s of ['preparing', 'ready']) assert.match(editLockReason({ status: s }), /accepted/);
});
const st = (freeAbove, charge) => ({ freeDeliveryAbove: freeAbove, deliveryCharge: charge });
test('delivery fee can be reduced or waived by an edit, never raised or re-added', () => {
  const one = applyEdit(items, [{ idx: 0, qty: 1 }]); // subtotal 140
  const big = applyEdit(items, [{ idx: 1, qty: 1 }]); // subtotal 320
  const d = (fee, store, next) => editedTotals({ orderType: 'delivery', deliveryFee: fee, discount: 0 }, next, store).deliveryFee;
  assert.equal(d(0, st(200, 50), one), 0);     // saved zero stays zero even though settings now charge 50 below 200
  assert.equal(d(40, st(200, 50), one), 40);   // saved 40, current 50 -> no raise
  assert.equal(d(60, st(200, 50), one), 50);   // saved 60, current 50 -> lowered
  assert.equal(d(40, st(100, 50), big), 0);    // threshold crossed upward in current settings -> waived
  assert.equal(d(40, st(500, 30), one), 30);   // settings cheaper -> lowered
  assert.equal(d(40, st(null, 50), one), 40);  // no threshold configured
  assert.equal(d(40, st(100, 50), items), 0);  // unchanged lines still follow no-increase
  for (const type of ['dine-in', 'takeaway', 'counter']) assert.equal(editedTotals({ orderType: type, deliveryFee: 0 }, one, st(null, 99)).deliveryFee, 0);
});
test('discount is kept as saved; an edit that would drop the subtotal below it is refused; equal is allowed', () => {
  const one = applyEdit(items, [{ idx: 0, qty: 1 }]); // subtotal 140
  const money = (discount, fee = 0) => editedTotals({ orderType: 'delivery', deliveryFee: fee, discount }, one, st(null, 50));
  assert.deepEqual(money(50), { subtotal: 140, discount: 50, deliveryFee: 0, total: 90 });
  assert.deepEqual(money(140), { subtotal: 140, discount: 140, deliveryFee: 0, total: 0 });
  assert.throws(() => money(141), e => e instanceof EditRefused && e.status === 409 && e.message === DISCOUNT_REFUSAL);
  assert.throws(() => money(500, 40), EditRefused);
  assert.equal(editedTotals({ orderType: 'dine-in' }, one).discount, 0);
  assert.equal(editedTotals({ orderType: 'dine-in', discount: -5 }, one).total, 140);
  // successful edit keeps the original grant for a later edit or Add items (no clamping happened)
  const o = { orderType: 'dine-in', discount: 60 };
  const after = editedTotals(o, applyEdit(items, [{ idx: 1, qty: 0 }]));
  assert.equal(after.discount, 60);
  const grown = editedTotals(o, [...applyEdit(items, [{ idx: 1, qty: 0 }]), { price: 50, qty: 2 }]);
  assert.equal(grown.discount, 60);
});
