// Order bot helpers. Pure functions only (no database, no network) so they are easy to test.
// The bot is OFF unless WHATSAPP_ORDER_BOT_ENABLED=true AND the store id is listed in
// WHATSAPP_ORDER_BOT_BUSINESS_IDS (comma separated). Start with the demo store only.
export const orderBotBusinessIds = () => (process.env.WHATSAPP_ORDER_BOT_BUSINESS_IDS || '').split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
export const orderBotEnabledFor = id => process.env.WHATSAPP_ORDER_BOT_ENABLED === 'true' && orderBotBusinessIds().includes(String(id));
export const orderRef = id => `DD-${id}`;
export const parseOrderRef = text => { const m = /\bDD-(\d{1,9})\b/i.exec(String(text || '')); return m ? Number(m[1]) : null; };
export function withOrderRef(url, id) {
  try {
    const u = new URL(url);
    u.searchParams.set('text', `${u.searchParams.get('text') || ''}\nOrder ref: ${orderRef(id)}`);
    return u.toString();
  } catch { return url; }
}
const rs = n => `Rs.${Number(n || 0).toFixed(2)}`;
export function itemsText(lead) {
  const items = Array.isArray(lead.items) && lead.items.length ? lead.items : null;
  if (!items) return lead.productName || 'your order';
  return items.map(i => `${i.qty} x ${i.name}`).join(', ');
}
export function confirmationText(store, lead) {
  return `Thanks for ordering from ${store.name}! We got your order ${orderRef(lead.id)}.\nItems: ${itemsText(lead)}\nTotal: ${rs(lead.price)}\nWe will update you here as your order moves.`;
}
export const STATUS_LABELS = { confirmed: 'confirmed', packed: 'packed and getting ready', shipped: 'shipped', 'out-for-delivery': 'out for delivery', delivered: 'delivered. Thank you for shopping with us!', 'in-progress': 'in progress', completed: 'completed. Thank you!', cancelled: 'cancelled' };
export function statusMessage(store, lead, status) {
  const label = STATUS_LABELS[status];
  return label ? `${store.name}: your order ${orderRef(lead.id)} is ${label}` : null;
}
