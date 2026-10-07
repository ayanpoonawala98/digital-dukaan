// Only local owner-dashboard destinations may survive login.
export function safeDashboardReturn(next) {
  if (typeof next !== 'string' || !/^\/dashboard(?:\?|$)/.test(next) || /[\\\r\n]/.test(next)) return '/dashboard';
  return next;
}
export function requestedOrderStore(stores, search) {
  const query = new URLSearchParams(search), slug = query.get('store');
  if (!slug || query.get('tab') !== 'leads') return null;
  return stores.find(store => store.slug === slug) || false;
}
