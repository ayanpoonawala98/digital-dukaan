// Per-staff permissions. Existing staff (permissions = null) keep the original fixed access.
export const KEYS = ['orders_view', 'order_status', 'whatsapp', 'import', 'products', 'leads', 'coupons'];
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
  if (method === 'GET' && /^tables(?:\/history|\/day-summary)?$/.test(route)) return has('orders_view');
  if (method === 'POST' && /^restaurant-orders\/\d+\/items$/.test(route)) return has('order_status');
  if (method === 'POST' && /^restaurant-orders\/\d+\/kot$/.test(route)) return has('order_status');
  if (method === 'GET' && route === 'menu-availability') return has('orders_view');
  if (method === 'POST' && /^menu-availability\/\d+$/.test(route)) return has('order_status');
  if (method === 'POST' && route === 'restaurant-orders') return has('order_status');
  if (method === 'POST' && /^tables\/\d+\/hold$/.test(route)) return has('order_status');
  if (method === 'POST' && route === 'table-bills') return has('order_status');
  if (method === 'GET' && route === 'table-requests') return has('orders_view');
  if (method === 'PATCH' && /^table-requests\/\d+$/.test(route)) return has('order_status');
  if (method === 'GET' && /^whatsapp-cloud\/(?:status|messages)$/.test(route)) return has('whatsapp');
  if (method === 'POST' && route === 'whatsapp-cloud/send') return has('whatsapp');
  if (method === 'POST' && /^(?:products\/import|customers\/import)\/(?:preview|commit)$/.test(route)) return has('import');
  if (has('products')) {
    if (method === 'GET' && /^(?:products|categories)$/.test(route)) return true;
    if (method === 'PATCH' && /^products\/\d+$/.test(route)) return true;
    if (method === 'POST' && route === 'products') return true;
    if (method === 'POST' && route === 'categories') return true;
    if (method === 'POST' && route === 'upload') return true;
  }
  if (has('coupons')) {
    if (method === 'GET' && route === 'coupons') return true;
    if (method === 'POST' && route === 'coupons') return true;
    if (method === 'PATCH' && /^coupons\/\d+$/.test(route)) return true;
  }
  if (has('leads')) {
    if (method === 'GET' && route === 'leads') return true;
    if (method === 'POST' && /^leads\/\d+\/status$/.test(route)) return true;
  }
  return false;
}
