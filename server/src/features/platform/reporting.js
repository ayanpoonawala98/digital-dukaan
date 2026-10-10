import { RESTAURANT_DONE } from '../orders/order-flows.js';
import { bad } from '../../shared/utils/core.js';
// Calendar dates are interpreted in India, never in the server's local timezone.
export function dateWindow(query = {}) {
  const read = value => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw bad(400, 'Use dates in YYYY-MM-DD format');
    const stamp = Date.parse(`${value}T00:00:00+05:30`);
    if (!Number.isFinite(stamp) || new Date(stamp + 330 * 60000).toISOString().slice(0, 10) !== value) throw bad(400, 'Choose a valid calendar date');
    return stamp;
  };
  const from = read(query.from), through = read(query.to);
  if (from !== null && through !== null && from > through) throw bad(400, 'Start date must be before end date');
  return { from, until: through === null ? null : through + 86400000, timezone: 'Asia/Kolkata' };
}
export function dateWhere(query, Op) {
  const { from, until } = dateWindow(query), range = {};
  if (from !== null) range[Op.gte] = new Date(from);
  if (until !== null) range[Op.lt] = new Date(until);
  return Object.getOwnPropertySymbols(range).length ? { createdAt: range } : {};
}
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const indiaDay = date => new Date(+new Date(date) + 330 * 60000).toISOString().slice(0, 10);
// A sale is a restaurant order that was served/delivered/picked up, or a retail or service order (stored as a lead) marked Delivered or Completed.
export const LEAD_SALE_STATUSES = ['delivered', 'completed'];
export function saleRows(orders = [], leads = []) {
  const retail = leads.filter(l => LEAD_SALE_STATUSES.includes(l.status)).map(l => ({ createdAt: l.createdAt, total: l.price, status: l.status, retail: true, items: Array.isArray(l.items) && l.items.length ? l.items : [{ name: l.productName, qty: 1, price: l.price }] }));
  return [...orders.filter(o => RESTAURANT_DONE.includes(o.status)), ...retail];
}
export function summarize(orders, leads, now = new Date()) {
  const completed = saleRows(orders, leads);
  const todayKey = indiaDay(now), monthKey = todayKey.slice(0, 7);
  const sum = values => values.reduce((n, o) => n + number(o.total), 0);
  const days = new Map(), top = new Map();
  for (const order of completed) {
    const day = indiaDay(order.createdAt); const item = days.get(day) || { date: day, total: 0, orders: 0 }; item.total += number(order.total); item.orders++; days.set(day, item);
    for (const item of order.items || []) { const key = String(item.name || 'Item'); const p = top.get(key) || { name: key, quantity: 0, itemValue: 0 }; p.quantity += number(item.qty); p.itemValue += number(item.qty) * number(item.price); top.set(key, p); }
  }
  const recordedTotal = sum(completed);
  return { recordedTotal, averageOrder: completed.length ? recordedTotal / completed.length : 0, today: sum(completed.filter(o => indiaDay(o.createdAt) === todayKey)), month: sum(completed.filter(o => indiaDay(o.createdAt).startsWith(monthKey))), completedOrders: completed.length, restaurantPending: orders.filter(o => o.status !== 'cancelled' && !RESTAURANT_DONE.includes(o.status)).length, cancelledOrders: orders.filter(o => o.status === 'cancelled').length, whatsappEnquiries: leads.length, retailDelivered: leads.filter(l => LEAD_SALE_STATUSES.includes(l.status)).length, enquiryValue: leads.filter(l => l.status !== 'cancelled' && !LEAD_SALE_STATUSES.includes(l.status)).reduce((n,l) => n + number(l.price),0), daily: [...days.values()].sort((a,b) => a.date.localeCompare(b.date)), topProducts: [...top.values()].sort((a,b) => b.quantity-a.quantity).slice(0,10), timezone: 'Asia/Kolkata', caveat: 'Totals use order-created dates in IST. Served restaurant orders and retail orders marked Delivered are recorded totals, not proof of payment. Other WhatsApp enquiries are requests, not sales.' };
}
export const csvCell = value => `"${String(value ?? '').replace(/^[\s]*[=+\-@]/, "' $&").replace(/"/g, '""')}"`;
export function ordersCsv(orders, kind) {
  const rows = [['Order ID','Type','Created (IST)','Status','Customer','Phone','Table','Recorded/request total INR','Items','Payment verified']];
  for (const o of orders) rows.push([o.id,kind,new Date(o.createdAt).toLocaleString('en-GB',{timeZone:'Asia/Kolkata',hour12:false}),o.status,o.customerName || '',o.customerPhone || '',o.tableNumber || '',number(kind==='restaurant'?o.total:o.price), (o.items||[]).map(i=>`${i.qty} x ${i.name}`).join('; ') || o.productName || '', 'No']);
  return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
