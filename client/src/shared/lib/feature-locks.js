// Mirrors server/src/feature-locks.js: superadmin-controlled per-store feature locks.
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
// Owner dashboard tab -> lockable feature. Tabs not listed are never locked.
export const TAB_FEATURES = { products: 'products', categories: 'products', leads: 'leads', customers: 'customers', sales: 'sales', coupons: 'coupons', referrals: 'referrals', staff: 'staff', restaurant: 'restaurant', notifications: 'notifications', broadcast: 'broadcast', 'whatsapp-cloud': 'whatsappCloud', settings: 'settings' };
export const locksOf = business => (business?.featureLocks && typeof business.featureLocks === 'object' && !Array.isArray(business.featureLocks)) ? business.featureLocks : {};
export const isTabLocked = (business, tab) => { const feature = TAB_FEATURES[tab]; return Boolean(feature && locksOf(business)[feature] === true); };
