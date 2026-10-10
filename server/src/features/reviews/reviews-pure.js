// Pure rules for product reviews. No database access.
export function cleanReview(input) {
  const rating = Number(input?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: 'Choose a rating from 1 to 5 stars' };
  const text = String(input?.text ?? '').replace(/\s+/g, ' ').trim();
  if (text.length > 600) return { error: 'Keep the review under 600 characters' };
  return { rating, text };
}
// One review per customer per product. The phone ties it to a person; with no phone the order is the identity.
export function reviewerKey(order, kind, phoneKey) {
  return phoneKey || `${kind}:${order.id}`;
}
// Public name is a first name only. Never a phone number or email.
export function publicName(name) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return /\d{4,}|@/.test(first) || !first ? 'Customer' : first.slice(0, 20);
}
// Products a customer may review from this order: lines with a product id, order not cancelled.
export function reviewableProducts(order) {
  if (!order || order.status === 'cancelled') return [];
  const ids = new Map();
  const items = Array.isArray(order.items) ? order.items : [];
  for (const i of items) { const id = Number(i?.productId ?? i?.id); if (Number.isInteger(id) && id > 0 && !ids.has(id)) ids.set(id, String(i.name || '')); }
  if (!ids.size && Number.isInteger(Number(order.productId)) && Number(order.productId) > 0) ids.set(Number(order.productId), String(order.productName || ''));
  return [...ids].map(([productId, name]) => ({ productId, name }));
}
export function summarize(rows) {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const r of rows) { dist[r.rating]++; sum += r.rating; }
  const count = rows.length;
  return { count, avg: count ? Math.round((sum / count) * 10) / 10 : 0, distribution: dist };
}
