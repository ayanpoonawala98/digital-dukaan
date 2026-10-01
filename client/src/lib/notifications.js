// Shared feedback for every page, including failures that do not reach the API.
let items = [];
let sequence = 0;
const listeners = new Set();
const timers = new Map();
const emit = () => listeners.forEach(fn => fn());
export const subscribeToToasts = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const toastSnapshot = () => items;
export function dismissToast(id) {
  clearTimeout(timers.get(id)); timers.delete(id);
  items = items.filter(item => item.id !== id); emit();
}
export function notify(type, message) {
  if (!message || !['success', 'error'].includes(type)) return;
  const text = String(message).slice(0, 400);
  if (items.some(item => item.type === type && item.message === text)) return;
  const id = ++sequence;
  if (items.length >= 4) dismissToast(items[0].id);
  items = [...items, { id, type, message: text }]; emit();
  timers.set(id, setTimeout(() => dismissToast(id), type === 'error' ? 8000 : 5000));
  timers.get(id)?.unref?.();
}
export function successFor(path, method, data) {
  if (path.includes('/whatsapp-cloud/send')) return ['unknown', 'submitting'].includes(data?.message?.status) ? null : 'Reply accepted. Delivery is not yet confirmed.';
  if (path.includes('/my-orders') && method === 'POST') return 'Order notifications enabled.';
  if (path.includes('push-subscription')) return method === 'DELETE' ? 'Notifications turned off.' : 'Notifications enabled.';
  if (path.includes('enquire')) return 'Order request created. The shop will confirm it.';
  if (path.endsWith('/restaurant-orders') && method === 'POST') return 'Order placed.';
  if (path.includes('/auth/login')) return 'Logged in successfully.';
  if (path.includes('feature-locks')) return 'Feature access updated.';
  if (path.includes('import') && path.includes('preview')) return 'Import preview ready. Nothing has been imported yet.';
  if (path.includes('push-broadcast')) return 'Notification request processed. Check the delivery results.';
  return method === 'DELETE' ? 'Removed successfully.' : method === 'POST' ? 'Request completed successfully.' : 'Changes saved successfully.';
}
