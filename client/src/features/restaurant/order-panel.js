// Only local owner-dashboard destinations may survive login.
export function safeDashboardReturn(next) {
  if (typeof next !== 'string' || !/^\/dashboard(?:\?|$)/.test(next) || /[\\\r\n]/.test(next)) return '/dashboard';
  return next;
}
export function requestedOrderStore(stores, search) {
  const query = new URLSearchParams(search), slug = query.get('store');
  if (!slug || !['leads', 'restaurant'].includes(query.get('tab'))) return null;
  return stores.find(store => store.slug === slug) || false;
}

export function requestedOrderTab(search) {
  const tab = new URLSearchParams(search).get('tab');
  return ['leads', 'restaurant'].includes(tab) ? tab : null;
}
