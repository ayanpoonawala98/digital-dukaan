// Mirrors server/src/features/restaurant/gst.js. The server recomputes every bill, so keep the two identical.
const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const gstView = (data, legacyRate) => {
  const mode = data?.gstMode;
  if (mode === 'off') return { mode: 'exclusive', rate: 0, fixed: true };
  if (mode === 'inclusive' || mode === 'exclusive') return { mode, rate: Number(data.gstRate ?? 5), fixed: true };
  return { mode: 'exclusive', rate: Number(legacyRate || 0), fixed: false };
};
export function billMoney(lines, charges, disc, { mode, rate }) {
  const sub = lines.reduce((a, l) => a + l.price * l.qty, 0), ch = charges.reduce((a, c) => a + Number(c.amount || 0), 0);
  let d = disc.type === 'pct' ? sub * Number(disc.value || 0) / 100 : Number(disc.value || 0);
  d = Math.max(0, Math.min(d || 0, sub + ch));
  const taxable = round2(sub + ch - d);
  if (!rate) return { sub, ch, d, half: 0, total: Math.round(taxable) };
  if (mode === 'inclusive') return { sub, ch, d, half: round2((taxable - taxable / (1 + rate / 100)) / 2), total: Math.round(taxable) };
  const half = round2(taxable * rate / 200);
  return { sub, ch, d, half, total: Math.round(taxable + half * 2) };
}
