// Per-staff permissions. Existing staff (permissions = null) keep the original fixed access.
export const KEYS = ['orders_view', 'order_status', 'whatsapp', 'import', 'products', 'leads'];
export const LEGACY = ['orders_view', 'order_status', 'whatsapp', 'import'];
export const effective = u => Array.isArray(u?.permissions) ? KEYS.filter(k => u.permissions.includes(k)) : LEGACY;
export const clean = v => {
  if (!Array.isArray(v) || v.some(k => typeof k !== 'string' || !KEYS.includes(k))) return null;
  return KEYS.filter(k => v.includes(k));
};
// Returns true when a staff user holding `perms` may call method + route (route has no leading slash).
export function staffAllowed(perms, method, route) {
  const has = k => perms.includes(k);
  if (method === 'GET' && /^(?:overview|shop-qr\.pdf)$/.test(route)) return true;
  if (method === 'GET' && /^restaurant-orders(?:\/report\.csv)?$/.test(route)) return has('orders_view');
  if (method === 'PATCH' && /^restaurant-orders\/\d+$/.test(route)) return has('order_status');
  if (method === 'GET' && /^whatsapp-cloud\/(?:status|messages)$/.test(route)) return has('whatsapp');
  if (method === 'POST' && route === 'whatsapp-cloud/send') return has('whatsapp');
  if (method === 'POST' && /^(?:products\/import|customers\/import)\/(?:preview|commit)$/.test(route)) return has('import');
  if (has('products')) {
    if (method === 'GET' && /^(?:products|categories)$/.test(route)) return true;
    if (method === 'PATCH' && /^products\/\d+$/.test(route)) return true;
    if (method === 'POST' && route === 'upload') return true;
  }
  if (has('leads')) {
    if (method === 'GET' && route === 'leads') return true;
    if (method === 'POST' && /^leads\/\d+\/status$/.test(route)) return true;
  }
  return false;
}
