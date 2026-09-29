import { useState } from 'react';

export function useStored(key, fallback) {
  const [items, setItems] = useState(() => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } });
  const save = next => { setItems(next); localStorage.setItem(key, JSON.stringify(next)); };
  return [items, save];
}

export function useCart(slug) {
  const [items, save] = useStored(`dd-cart-${slug}`, []);
  const add = (product, qty = 1) => {
    const found = items.find(i => i.id === product.id);
    if (found) save(items.map(i => i.id === product.id ? { ...i, qty: Math.min((product.stock ?? 99) || 99, i.qty + qty) } : i));
    else save([...items, { id: product.id, name: product.name, price: product.price, imageUrl: product.imageUrl, stock: product.stock, qty }]);
  };
  const setQty = (id, qty) => qty <= 0 ? save(items.filter(i => i.id !== id)) : save(items.map(i => i.id === id ? { ...i, qty } : i));
  const clear = () => save([]);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  return { items, add, setQty, clear, count, subtotal };
}

export function useWishlist(slug) {
  const [ids, save] = useStored(`dd-wishlist-${slug}`, []);
  const toggle = id => save(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  return { ids, toggle, has: id => ids.includes(id) };
}

export function useOrders(slug) {
  const [orders, save] = useStored(`dd-orders-${slug}`, []);
  const record = (items, total) => save([{ date: new Date().toISOString(), items, total }, ...orders].slice(0, 5));
  return { orders, record };
}
