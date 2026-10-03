// Superadmin-controlled per-store feature locks. A locked feature is enforced
// server-side on owner/staff routes and shown with a lock icon in the owner dashboard.
export const LOCKABLE_FEATURES = [
  { key: 'products', label: 'Products and categories' },
  { key: 'leads', label: 'Orders' },
  { key: 'customers', label: 'Customers (CRM)' },
  { key: 'sales', label: 'Sales dashboard' },
  { key: 'coupons', label: 'Coupons' },
  { key: 'referrals', label: 'Referrals' },
  { key: 'staff', label: 'Staff accounts' },
  { key: 'restaurant', label: 'Table orders' },
  { key: 'notifications', label: 'Push notifications' },
  { key: 'broadcast', label: 'WhatsApp broadcast' },
  { key: 'whatsappCloud', label: 'WhatsApp integration' },
  { key: 'settings', label: 'Shop settings' }
];
export const LOCKABLE_KEYS = LOCKABLE_FEATURES.map(f => f.key);

export const locksOf = business => {
  const raw = business?.featureLocks;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
};
export const isLocked = (business, feature) => locksOf(business)[feature] === true;

// Maps an owner API route (method + path relative to /:storeId) to the feature it belongs to.
// Unmapped routes (overview, store create/delete/restore, upload) are never locked.
export function featureForOwnerRoute(method, route) {
  const path = String(route || '').replace(/^\//, '');
  const rules = [
    [/^products(?:\/|$)/, 'products'],
    [/^categories(?:\/|$)/, 'products'],
    [/^import\/vyapar$/, 'products'],
    [/^leads(?:\/|$)/, 'leads'],
    [/^export\/vyapar\.csv$/, 'leads'],
    [/^customers(?:\/|$)/, 'customers'],
    [/^sales-summary(?:\/|$)/, 'sales'],
    [/^coupons(?:\/|$)/, 'coupons'],
    [/^referrals(?:\/|$)/, 'referrals'],
    [/^staff(?:\/|$)/, 'staff'],
    [/^restaurant-orders(?:\/|$)/, 'restaurant'],
    [/^push-broadcast$/, 'notifications'],
    [/^push-subscribers$/, 'notifications'],
    [/^whatsapp-cloud(?:\/|$)/, 'whatsappCloud']
  ];
  for (const [pattern, feature] of rules) if (pattern.test(path)) return feature;
  if (method === 'PATCH' && path === 'business') return 'settings';
  return null;
}
