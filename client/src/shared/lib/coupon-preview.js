import { useEffect, useState } from 'react';
import { api } from './api.js';
import { cleanCode, validCodeShape } from './coupon-math.js';
export { totalAfterCoupon } from './coupon-math.js';
// Debounced preview of the coupon discount. Returns { discount, error, checking }.
export function useCouponPreview(slug, code, subtotal) {
  const [state, setState] = useState({ discount: 0, error: '', checking: false, code: '' });
  useEffect(() => {
    const c = cleanCode(code);
    if (!c || !subtotal || !validCodeShape(c)) { setState({ discount: 0, error: '', checking: false, code: '' }); return undefined; }
    let live = true; setState(s => ({ ...s, checking: true, error: '' }));
    const t = setTimeout(async () => {
      try { const r = await api(`/public/stores/${slug}/coupon-preview`, { method: 'POST', body: { couponCode: c, subtotal }, feedback: false }); if (live) setState({ discount: Number(r.discount) || 0, error: '', checking: false, code: r.code || c }); }
      catch (e) { if (live) setState({ discount: 0, error: e.message || 'Could not check this coupon', checking: false, code: '' }); }
    }, 600);
    return () => { live = false; clearTimeout(t); };
  }, [slug, code, subtotal]);
  return state;
}
