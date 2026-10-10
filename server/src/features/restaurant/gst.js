// Bill GST. MONEY LOGIC - the client mirrors this in client/src/features/restaurant/gst.js; keep both identical.
// mode: null = legacy (rate picked per bill, added on top); 'off' = no GST; 'exclusive' = added on top; 'inclusive' = already inside the prices.
export const GST_RATES = [0, 5, 12, 18, 28];
export const GST_MODES = ['off', 'inclusive', 'exclusive'];
const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
// Which mode and rate apply to a bill. Once the owner picks a mode in settings, the client's rate is ignored.
export function gstSetting(store, clientRate) {
  const mode = GST_MODES.includes(store?.gstMode) ? store.gstMode : null;
  if (!mode) return { mode: 'exclusive', rate: Number(clientRate ?? 0), legacy: true };
  if (mode === 'off') return { mode: 'exclusive', rate: 0, legacy: false };
  return { mode, rate: Number(store.gstRate ?? 5), legacy: false };
}
export function billTotals({ subtotal, chargesTotal, discount, mode, rate }) {
  const taxable = round2(subtotal + chargesTotal - discount);
  if (!rate) return { taxable, half: 0, total: Math.round(taxable) };
  if (mode === 'inclusive') return { taxable, half: round2((taxable - taxable / (1 + rate / 100)) / 2), total: Math.round(taxable) };
  const half = round2(taxable * rate / 200);
  return { taxable, half, total: Math.round(taxable + half * 2) };
}
