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
// __names remembers each line's label so a later ticket can say what was removed.
export const printedMap = items => { const m = {}, n = {}; for (const i of Array.isArray(items) ? items : []) { m[kotKey(i)] = (m[kotKey(i)] || 0) + (Number(i.qty) || 0); n[kotKey(i)] = [i.name, i.variant].filter(Boolean).join(' '); } m.__names = n; return m; };


// Lines whose quantity went down (or that were removed) since the last printed ticket. printed = { key: qty on paper }.
export function revisedLines(items, printed) {
  const now = {}, names = {};
  for (const i of Array.isArray(items) ? items : []) { const k = kotKey(i); now[k] = (now[k] || 0) + (Number(i.qty) || 0); names[k] = i; }
  return Object.entries(printed || {}).filter(([k, q]) => k !== '__names' && (now[k] || 0) < Number(q)).map(([k, q]) => ({ name: [names[k]?.name, names[k]?.variant].filter(Boolean).join(' ') || printed.__names?.[k] || 'Item', from: Number(q), to: now[k] || 0 }));
}
