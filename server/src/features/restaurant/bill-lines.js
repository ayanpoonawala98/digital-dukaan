// Bill lines carry variant, add-ons and note, and every price is re-read on the server. MONEY LOGIC.
import { cleanNote } from './menu-options.js';
const bad = (status, message) => Object.assign(new Error(message), { status });
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const extras = it => ({ ...(it.variant ? { variant: it.variant } : {}), ...(Array.isArray(it.addons) && it.addons.length ? { addons: it.addons.map(a => ({ group: a.group, name: a.name, price: Number(a.price) })) } : {}), ...(it.note ? { note: it.note } : {}) });

// A line that comes from an order: price, name, variant, add-ons and note are copied from the saved order item.
// Only the quantity comes from the client. itemIdx identifies the item; old clients send the name instead.
export function orderLine(l, order, qty) {
  const items = Array.isArray(order.items) ? order.items : [];
  let idx = Number.isInteger(Number(l.itemIdx)) && l.itemIdx !== null && l.itemIdx !== undefined && l.itemIdx !== '' ? Number(l.itemIdx) : items.findIndex(i => i.name === l.name);
  const it = items[idx];
  if (!it) throw bad(400, 'Bill line does not match its order');
  return { name: clean(it.name, 120), price: Number(it.price), qty, orderId: order.id, itemIdx: idx, productId: it.productId ? Number(it.productId) : null, ...extras(it) };
}

// A line added at the bill from the menu: priced from the product (or the chosen variant), never from the client.
export function addedLine(l, product, qty) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  let price = Number(product.price), variant = '';
  if (variants.length) {
    const v = variants.find(x => x.name === String(l.variant ?? ''));
    if (!v) throw bad(400, `Choose a size for ${product.name}`);
    price = Number(v.price); variant = v.name;
  }
  const note = cleanNote(l.note, 140);
  return { name: product.name, price, qty, productId: product.id, ...(variant ? { variant } : {}), ...(note ? { note } : {}) };
}
