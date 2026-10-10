import test from 'node:test';
import assert from 'node:assert/strict';
import { billTotals, gstSetting } from './gst.js';
test('exclusive matches the previous formula', () => {
  const t = billTotals({ subtotal: 500, chargesTotal: 0, discount: 50, mode: 'exclusive', rate: 5 });
  assert.equal(t.half, 11.25); assert.equal(t.total, Math.round(450 + 22.5));
});
test('inclusive does not raise the total and extracts the tax', () => {
  const t = billTotals({ subtotal: 105, chargesTotal: 0, discount: 0, mode: 'inclusive', rate: 5 });
  assert.equal(t.total, 105); assert.equal(t.half, 2.5);
});
test('zero rate adds nothing', () => { assert.equal(billTotals({ subtotal: 99.5, chargesTotal: 0, discount: 0, mode: 'exclusive', rate: 0 }).total, 100); });
test('settings override the client rate; unset store keeps legacy', () => {
  assert.deepEqual(gstSetting({ gstMode: 'inclusive', gstRate: 12 }, 5), { mode: 'inclusive', rate: 12, legacy: false });
  assert.deepEqual(gstSetting({ gstMode: 'off' }, 18), { mode: 'exclusive', rate: 0, legacy: false });
  assert.deepEqual(gstSetting({}, 18), { mode: 'exclusive', rate: 18, legacy: true });
});

test('round-off is stored so taxable + cgst + sgst + roundOff equals the total', () => {
  for (const [subtotal, rate, mode] of [[333.33, 5, 'exclusive'], [101, 18, 'exclusive'], [250.5, 12, 'inclusive'], [99.99, 0, 'exclusive']]) {
    const t = billTotals({ subtotal, chargesTotal: 0, discount: 0, mode, rate });
    const gstOnTop = mode === 'exclusive' ? t.half * 2 : 0;
    assert.ok(Math.abs(t.taxable + gstOnTop + t.roundOff - t.total) < 0.0051, JSON.stringify(t));
    assert.ok(Math.abs(t.roundOff) <= 0.5 + 1e-9);
  }
});
