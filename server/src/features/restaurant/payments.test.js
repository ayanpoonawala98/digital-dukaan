import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePayments, byMode } from './payments.js';
test('no payments keeps the single-mode behaviour', () => {
  assert.deepEqual(normalizePayments([], 473, 'upi'), { payments: [{ mode: 'upi', amount: 473 }], paymentMode: 'upi' });
});
test('split must add up to the total', () => {
  const r = normalizePayments([{ mode: 'cash', amount: 200 }, { mode: 'upi', amount: 273 }], 473, 'cash');
  assert.equal(r.paymentMode, 'split');
  assert.throws(() => normalizePayments([{ mode: 'cash', amount: 200 }, { mode: 'upi', amount: 200 }], 473), /add up/);
  assert.throws(() => normalizePayments([{ mode: 'cash', amount: 473 }, { mode: 'cash', amount: 0.5 }], 473), /once/);
  assert.throws(() => normalizePayments([{ mode: 'cash', amount: 0 }], 473), /above zero/);
});
test('daily summary by mode includes old single-mode bills', () => {
  assert.deepEqual(byMode([{ paymentMode: 'cash', total: 100, payments: [] }, { paymentMode: 'split', total: 300, payments: [{ mode: 'cash', amount: 100 }, { mode: 'card', amount: 200 }] }]), { cash: 200, upi: 0, card: 200 });
});
