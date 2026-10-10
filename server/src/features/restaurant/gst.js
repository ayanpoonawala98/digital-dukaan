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
// Rule: taxable = items + charges - discount. CGST and SGST are each taxable x rate / 2, to the paisa. The final total is rounded to
// the whole rupee and the difference is kept as roundOff, so taxable + cgst + sgst + roundOff equals the total exactly.
export function billTotals({ subtotal, chargesTotal, discount, mode, rate }) {
  const taxable = round2(subtotal + chargesTotal - discount);
  const finish = (half, exact) => { const total = Math.round(exact); return { taxable, half, total, roundOff: round2(total - exact) }; };
  if (!rate) return finish(0, taxable);
  if (mode === 'inclusive') return finish(round2((taxable - taxable / (1 + rate / 100)) / 2), taxable);
  const half = round2(taxable * rate / 200);
  return finish(half, round2(taxable + half * 2));
}
