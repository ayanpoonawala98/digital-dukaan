import { useState } from 'react';
import { notify } from '../notifications/notifications.js';

export function useStored(key, fallback) {
  const [items, setItems] = useState(() => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } });
  const save = next => { try { localStorage.setItem(key, JSON.stringify(next)); setItems(next); } catch { notify('error', 'Could not save on this device. Check browser storage settings.'); throw Error('Browser storage unavailable'); } };
  return [items, save];
}

export const lineKey = i => i.key ?? i.id;
export const configKey = (id, config) => (config && (config.variant || (config.addonList || []).length || config.note)) ? `${id}|${config.variant || ''}|${(config.addonList || []).map(a => a.group + ':' + a.name).sort().join(',')}|${config.note || ''}` : id;
export function useCart(slug) {
  const [items, save] = useStored(`dd-cart-${slug}`, []);
  // config (restaurant only): { variant, addons: {groupId:[names]}, addonList: [{group,name,price}], note, unitPrice }
  const add = (product, qty = 1, answers, config) => {
    const key = configKey(product.id, config), found = items.find(i => lineKey(i) === key), customFields = Array.isArray(product.customFields) ? product.customFields : [];
    const cap = (product.stock ?? 99) || 99;
    if (found) save(items.map(i => lineKey(i) === key ? { ...i, customFields, answers: answers || i.answers || {}, qty: Math.min(cap, i.qty + qty) } : i));
    else save([...items, { id: product.id, ...(key !== product.id ? { key } : {}), name: product.name, price: config?.unitPrice ?? product.price, imageUrl: product.imageUrl, stock: product.stock, qty, customFields, answers: answers || {}, ...(config ? { variant: config.variant || '', addons: config.addons || {}, addonList: config.addonList || [], note: config.note || '', veg: product.veg || '' } : {}) }]);
    notify('success', 'Added to cart.');
  };
  const setQty = (k, qty) => qty <= 0 ? save(items.filter(i => lineKey(i) !== k)) : save(items.map(i => lineKey(i) === k ? { ...i, qty } : i));
  const setAnswers = (k, answers) => save(items.map(i => lineKey(i) === k ? { ...i, answers } : i));
  const setNote = (k, note) => save(items.map(i => lineKey(i) === k ? { ...i, note: note.slice(0, 140) } : i));
  const clear = () => save([]);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  return { items, add, setQty, setAnswers, setNote, clear, count, subtotal };
}

export function useWishlist(slug) {
  const [ids, save] = useStored(`dd-wishlist-${slug}`, []);
  const toggle = id => { const removing = ids.includes(id); save(removing ? ids.filter(x => x !== id) : [...ids, id]); notify('success', removing ? 'Removed from wishlist.' : 'Added to wishlist.'); };
  return { ids, toggle, has: id => ids.includes(id) };
}

export function useOrders(slug) {
  const [orders, save] = useStored(`dd-orders-${slug}`, []);
  const record = (items, total) => save([{ date: new Date().toISOString(), items, total }, ...orders].slice(0, 5));
  return { orders, record };
}
