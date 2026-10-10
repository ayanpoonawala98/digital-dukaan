// Pure KOT helpers (no database).
// Same dish + size + add-ons + note = same kitchen line.
export const kotKey = i => JSON.stringify([i.productId ?? i.name, i.variant || '', (i.addons || []).map(a => `${a.group || ''}:${a.name}`).sort(), i.note || '']);

// items: order lines; printed: { key: qty already on a ticket }. mode 'all' lists everything.
export function kotLines(items, printed, mode = 'new') {
  const out = [];
  for (const i of Array.isArray(items) ? items : []) {
    const qty = Number(i.qty) || 0, done = mode === 'all' ? 0 : Number(printed?.[kotKey(i)] || 0), n = qty - done;
    if (n > 0) out.push({ name: i.name, qty: n, variant: i.variant || '', addons: (i.addons || []).map(a => a.name), note: i.note || '', answers: (i.answers || []).map(a => `${a.label}: ${a.value}`) });
  }
  return out;
}
export const printedMap = items => { const m = {}; for (const i of Array.isArray(items) ? items : []) m[kotKey(i)] = (m[kotKey(i)] || 0) + (Number(i.qty) || 0); return m; };

