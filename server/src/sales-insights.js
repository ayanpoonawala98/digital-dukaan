// Read-only analytics for the Sales dashboard. Pure functions over already-loaded rows; all dates are IST.
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const IST = 330 * 60000;
const dayKey = d => new Date(+new Date(d) + IST).toISOString().slice(0, 10);
const istParts = d => { const x = new Date(+new Date(d) + IST); return { hour: x.getUTCHours(), weekday: x.getUTCDay() }; };
const bump = (map, key, f) => { const o = map.get(key) || {}; f(o); map.set(key, o); };
const addDays = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export function insights(orders = [], leads = [], now = new Date(), maxDays = 60) {
  const today = dayKey(now);
  const liveLeads = leads.filter(l => l.status !== 'cancelled'), liveOrders = orders.filter(o => o.status !== 'cancelled'), served = orders.filter(o => o.status === 'served');
  // Daily series, zero-filled, ending today (or the latest record if it is later) and at most maxDays long.
  const all = [...leads, ...orders].map(r => dayKey(r.createdAt));
  const last = all.reduce((m, k) => (k > m ? k : m), today);
  const first = all.reduce((m, k) => (k < m ? k : m), last);
  let start = first; if (addDays(last, -(maxDays - 1)) > start) start = addDays(last, -(maxDays - 1));
  const series = new Map();
  for (let k = start; k <= last; k = addDays(k, 1)) series.set(k, { date: k, enquiries: 0, enquiryValue: 0, orders: 0, servedOrders: 0, servedValue: 0 });
  for (const l of liveLeads) { const s = series.get(dayKey(l.createdAt)); if (s) { s.enquiries++; s.enquiryValue += num(l.price); } }
  for (const o of liveOrders) { const s = series.get(dayKey(o.createdAt)); if (s) s.orders++; }
  for (const o of served) { const s = series.get(dayKey(o.createdAt)); if (s) { s.servedOrders++; s.servedValue += num(o.total); } }

  const count = (rows, f) => rows.reduce((m, r) => { const k = f(r) || 'unknown'; m[k] = (m[k] || 0) + 1; return m; }, {});
  const leadStatus = count(leads, l => l.status), orderStatus = count(orders, o => o.status), orderTypes = count(liveOrders, o => o.orderType);

  const enquired = new Map();
  for (const l of liveLeads) {
    const items = Array.isArray(l.items) && l.items.length ? l.items : [{ name: l.productName, qty: 1, price: l.price }];
    for (const it of items) { const name = String(it.name || l.productName || 'Item').slice(0, 80); bump(enquired, name, o => { o.name = name; o.units = (o.units || 0) + (num(it.qty) || 1); o.value = (o.value || 0) + (num(it.qty) || 1) * num(it.price); o.enquiries = (o.enquiries || 0) + 1; }); }
  }
  const dishes = new Map();
  for (const o of liveOrders) for (const it of o.items || []) bump(dishes, String(it.name || 'Item'), x => { x.name = String(it.name || 'Item'); x.units = (x.units || 0) + num(it.qty); x.value = (x.value || 0) + num(it.qty) * num(it.price); });
  const top = m => [...m.values()].sort((a, b) => b.units - a.units || b.value - a.value).slice(0, 8);

  const tables = new Map();
  for (const o of liveOrders) if (o.orderType === 'dine-in' && o.tableNumber) bump(tables, String(o.tableNumber), x => { x.table = String(o.tableNumber); x.orders = (x.orders || 0) + 1; x.value = (x.value || 0) + num(o.total); });

  const hourly = Array(24).fill(0), weekday = Array(7).fill(0);
  for (const r of [...liveLeads, ...liveOrders]) { const p = istParts(r.createdAt); hourly[p.hour]++; weekday[p.weekday]++; }
  const peakHour = hourly.some(Boolean) ? hourly.indexOf(Math.max(...hourly)) : null, peakWeekday = weekday.some(Boolean) ? weekday.indexOf(Math.max(...weekday)) : null;

  const phones = new Map();
  for (const r of [...liveLeads, ...liveOrders]) { const p = String(r.customerPhone || '').replace(/\D/g, '').slice(-10); if (p.length === 10) phones.set(p, (phones.get(p) || 0) + 1); }
  const customers = { identified: phones.size, repeat: [...phones.values()].filter(n => n > 1).length, withoutContact: liveLeads.length + liveOrders.length - [...phones.values()].reduce((a, b) => a + b, 0) };

  const coupons = new Map();
  for (const r of [...liveLeads, ...liveOrders]) if (r.couponCode) bump(coupons, r.couponCode, x => { x.code = r.couponCode; x.uses = (x.uses || 0) + 1; x.discount = (x.discount || 0) + num(r.discount); });

  const win = (from, to) => { const keys = [...series.keys()].filter(k => k >= from && k <= to).map(k => series.get(k)); return { enquiries: keys.reduce((n, s) => n + s.enquiries, 0), enquiryValue: keys.reduce((n, s) => n + s.enquiryValue, 0), orders: keys.reduce((n, s) => n + s.orders, 0), servedValue: keys.reduce((n, s) => n + s.servedValue, 0), servedOrders: keys.reduce((n, s) => n + s.servedOrders, 0) }; };
  const done = leads.filter(l => ['delivered', 'completed'].includes(l.status)).length;
  return {
    series: [...series.values()],
    leadStatus, orderStatus, orderTypes,
    topEnquired: top(enquired), topDishes: top(dishes), tables: [...tables.values()].sort((a, b) => b.orders - a.orders).slice(0, 10),
    hourly, weekday, peakHour, peakWeekday, customers,
    coupons: [...coupons.values()].sort((a, b) => b.uses - a.uses).slice(0, 5),
    week: { last7: win(addDays(last, -6), last), prev7: win(addDays(last, -13), addDays(last, -7)) },
    fulfilment: { total: leads.length, done, cancelled: leads.filter(l => l.status === 'cancelled').length, open: leads.length - done - leads.filter(l => l.status === 'cancelled').length },
    avgEnquiry: liveLeads.length ? liveLeads.reduce((n, l) => n + num(l.price), 0) / liveLeads.length : 0,
    avgOrder: liveOrders.length ? liveOrders.reduce((n, o) => n + num(o.total), 0) / liveOrders.length : 0,
    seriesDays: series.size, truncated: addDays(last, -(maxDays - 1)) > first,
  };
}
