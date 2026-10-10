import test from 'node:test';
import assert from 'node:assert/strict';
import { totalAfterCoupon, validCodeShape } from './coupon-math.js';
test('total after coupon mirrors the server maths', () => {
  assert.equal(totalAfterCoupon(500, 50, 40), 490);
  assert.equal(totalAfterCoupon(100, 100, 0), 0);
  assert.equal(totalAfterCoupon(100.1, 10.05, 0), 90.05);
  assert.equal(totalAfterCoupon(100, 500, 0), 0);
});
test('code shape matches the server rule', () => {
  assert.ok(validCodeShape(' save10 '));
  assert.ok(!validCodeShape('ab'));
  assert.ok(!validCodeShape('no spaces'));
});
