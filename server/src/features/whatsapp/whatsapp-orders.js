// Order bot helpers. Pure functions only (no database, no network) so they are easy to test.
// The bot is OFF unless WHATSAPP_ORDER_BOT_ENABLED=true AND the store id is listed in
// WHATSAPP_ORDER_BOT_BUSINESS_IDS (comma separated). Start with the demo store only.
export const orderBotBusinessIds = () => (process.env.WHATSAPP_ORDER_BOT_BUSINESS_IDS || '').split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
export const orderBotEnabledFor = id => process.env.WHATSAPP_ORDER_BOT_ENABLED === 'true' && orderBotBusinessIds().includes(String(id));
import crypto from 'node:crypto';
import { orderPhone } from '../crm/customer-pure.js';
export const orderRef = id => `DD-${id}`;
// A short random code printed in the customer's own order message. For an order with no phone on file it is the only way to link a
// WhatsApp number to the order, so a guessed or sequential DD-<id> alone never reveals or claims anything.
const CLAIM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newClaimCode = () => Array.from(crypto.randomBytes(8), b => CLAIM_ALPHABET[b % CLAIM_ALPHABET.length]).join('');
export const parseOrderClaim = text => { const m = /\bDD-(\d{1,9})(?:-([A-Za-z0-9]{8}))?\b/i.exec(String(text || '')); return m ? { id: Number(m[1]), code: m[2] ? m[2].toUpperCase() : null } : null; };
const sameCode = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };
// 'match': the sender is the phone already on the order. 'claim': the order has no phone and the sender holds its claim code.
// Anything else is 'deny' and must look exactly like an unknown order.
export function decideOrderAccess(lead, senderPhone, code) {
  const sender = orderPhone(senderPhone);
  if (!lead || !sender) return 'deny';
  const onFile = orderPhone(lead.customerPhone);
  if (onFile) return onFile === sender ? 'match' : 'deny';
  return lead.claimCode && sameCode(String(code || '').toUpperCase(), lead.claimCode) ? 'claim' : 'deny';
}
export const parseOrderRef = text => { const m = /\bDD-(\d{1,9})\b/i.exec(String(text || '')); return m ? Number(m[1]) : null; };
export function withOrderRef(url, id, code) {
  try {
    const u = new URL(url);
    u.searchParams.set('text', `${u.searchParams.get('text') || ''}\nOrder ref: ${orderRef(id)}${code ? `-${code}` : ''}`);
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
