// Split / partial payment on a bill. MONEY-ADJACENT: payments must add up to the server-computed total.
export const PAY_MODES = ['cash', 'upi', 'card'];
const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const bad = (status, message) => Object.assign(new Error(message), { status });
export function normalizePayments(raw, total, fallbackMode) {
  const list = Array.isArray(raw) ? raw : [];
  if (!list.length) { const mode = PAY_MODES.includes(fallbackMode) ? fallbackMode : 'cash'; return { payments: [{ mode, amount: round2(total) }], paymentMode: mode }; }
  if (list.length > PAY_MODES.length) throw bad(400, 'Too many payment lines');
  const seen = new Set(), payments = list.map(p => {
    const amount = round2(p?.amount);
    if (!PAY_MODES.includes(p?.mode) || seen.has(p.mode)) throw bad(400, 'Choose each payment mode once');
    seen.add(p.mode);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e7) throw bad(400, 'Enter a payment amount above zero');
    return { mode: p.mode, amount };
  });
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0));
  if (Math.abs(paid - round2(total)) > 0.005) throw bad(400, `Payments add up to ${paid}, but the bill total is ${round2(total)}`);
  return { payments, paymentMode: payments.length === 1 ? payments[0].mode : 'split' };
}
export function byMode(rows) {
  const out = { cash: 0, upi: 0, card: 0 };
  for (const r of rows) {
    const list = Array.isArray(r.payments) && r.payments.length ? r.payments : [{ mode: r.paymentMode, amount: r.total }];
    for (const p of list) if (out[p.mode] !== undefined) out[p.mode] = round2(out[p.mode] + Number(p.amount || 0));
  }
  return out;
}
