import { api } from './api.js';

const key = slug => `dd-my-orders-${slug}`;
const EVENT = 'dd-my-orders';

export function loadSavedOrders(slug) {
  try {
    const list = JSON.parse(localStorage.getItem(key(slug)) || '[]');
    const legacy = JSON.parse(localStorage.getItem(`dd-restaurant-orders-${slug}`) || '[]');
    const merged = [...(Array.isArray(list) ? list : []), ...(Array.isArray(legacy) ? legacy.filter(o => o.orderId && o.trackingToken).map(o => ({ kind: 'restaurant', id: o.orderId, token: o.trackingToken, total: o.total, date: o.date })) : [])];
    const seen = new Set();
    return merged.filter(o => o.id && o.token && !seen.has(`${o.kind}:${o.id}`) && seen.add(`${o.kind}:${o.id}`)).slice(0, 30);
  } catch { return []; }
}

export function saveOrder(slug, order) {
  try {
    const rest = loadSavedOrders(slug).filter(o => !(o.kind === order.kind && o.id === order.id));
    localStorage.setItem(key(slug), JSON.stringify([{ ...order, date: order.date || new Date().toISOString() }, ...rest].slice(0, 30)));
    window.dispatchEvent(new Event(EVENT));
  } catch {}
}

export const onOrdersChanged = fn => { window.addEventListener(EVENT, fn); return () => window.removeEventListener(EVENT, fn); };

export const trackingPath = (slug, kind, id, token) => `/store/${slug}/order/${kind === 'lead' ? 'lead/' : ''}${id}#token=${encodeURIComponent(token)}`;

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function currentBrowserSubscription() {
  if (!pushSupported()) return null;
  try { const reg = await navigator.serviceWorker.register('/sw.js'); return await reg.pushManager.getSubscription(); } catch { return null; }
}

const urlB64ToUint8Array = base64String => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const raw = atob((base64String + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
};

// One tap: ask permission, create the browser's push subscription, return its JSON.
export async function subscribeBrowser(slug) {
  const { vapidPublicKey } = await api(`/public/stores/${encodeURIComponent(slug)}/push-key`);
  if (!vapidPublicKey) throw Error('This store has not enabled notifications yet.');
  const reg = await navigator.serviceWorker.register('/sw.js');
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(vapidPublicKey) });
  return sub.toJSON();
}
