// Coupon safeguards. Pure so the money rules are testable. A coupon is always a percent off the item subtotal,
// optionally capped (maxDiscount), gated by a minimum order, an IST expiry day and a total usage limit.
const num = (v, name, max) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw Object.assign(new Error(`${name} must be a number between 0 and ${max}`), { status: 400 });
  return Math.round(n * 100) / 100;
};
export function cleanCouponLimits(body = {}) {
  const minOrder = num(body.minOrder, 'Minimum order', 1000000) || null;
  const maxDiscount = num(body.maxDiscount, 'Maximum discount', 1000000) || null;
  const usageLimit = body.usageLimit === undefined || body.usageLimit === null || body.usageLimit === '' ? null : Number(body.usageLimit);
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1 || usageLimit > 1000000)) throw Object.assign(new Error('Usage limit must be a whole number of 1 or more'), { status: 400 });
  const expiresOn = body.expiresOn ? String(body.expiresOn) : null;
  if (expiresOn !== null && !(/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) && !Number.isNaN(Date.parse(`${expiresOn}T00:00:00Z`)))) throw Object.assign(new Error('Use an expiry date like 2026-10-31'), { status: 400 });
  return { minOrder, maxDiscount, usageLimit, expiresOn };
}
// Returns { discount } or { error } with a customer-safe reason.
export function couponDiscount(coupon, subtotal, today, used = 0) {
  if (coupon.expiresOn && today > String(coupon.expiresOn).slice(0, 10)) return { error: 'This coupon has expired' };
  if (coupon.usageLimit && used >= coupon.usageLimit) return { error: 'This coupon has been fully used' };
  if (coupon.minOrder && subtotal < coupon.minOrder) return { error: `Add items worth Rs.${Number(coupon.minOrder).toFixed(0)} or more to use this coupon` };
  let discount = Number((subtotal * coupon.percentOff / 100).toFixed(2));
  if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount));
  return { discount: Math.min(discount, subtotal) };
}
