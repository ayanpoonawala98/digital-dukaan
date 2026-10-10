import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCouponLimits, couponDiscount } from './coupon-rules.js';
const c = (o = {}) => ({ percentOff: 20, minOrder: null, maxDiscount: null, usageLimit: null, expiresOn: null, ...o });
test('plain coupon is a percent of the subtotal', () => assert.deepEqual(couponDiscount(c(), 500, '2026-10-11'), { discount: 100 }));
test('max discount caps the amount', () => assert.equal(couponDiscount(c({ maxDiscount: 50 }), 500, '2026-10-11').discount, 50));
test('minimum order, expiry and usage limit block with a clear reason', () => {
  assert.match(couponDiscount(c({ minOrder: 300 }), 299, '2026-10-11').error, /Rs\.300/);
  assert.equal(couponDiscount(c({ minOrder: 300 }), 300, '2026-10-11').discount, 60);
  assert.match(couponDiscount(c({ expiresOn: '2026-10-10' }), 500, '2026-10-11').error, /expired/);
  assert.equal(couponDiscount(c({ expiresOn: '2026-10-11' }), 500, '2026-10-11').discount, 100); // valid through the expiry day
  assert.match(couponDiscount(c({ usageLimit: 5 }), 500, '2026-10-11', 5).error, /fully used/);
  assert.equal(couponDiscount(c({ usageLimit: 5 }), 500, '2026-10-11', 4).discount, 100);
});
test('limit input is validated and blanks mean no limit', () => {
  assert.deepEqual(cleanCouponLimits({}), { minOrder: null, maxDiscount: null, usageLimit: null, expiresOn: null });
  assert.deepEqual(cleanCouponLimits({ minOrder: '200', usageLimit: '10', expiresOn: '2026-12-31' }), { minOrder: 200, maxDiscount: null, usageLimit: 10, expiresOn: '2026-12-31' });
  assert.throws(() => cleanCouponLimits({ usageLimit: 0 }));
  assert.throws(() => cleanCouponLimits({ minOrder: -5 }));
  assert.throws(() => cleanCouponLimits({ expiresOn: '31/12/2026' }));
});
