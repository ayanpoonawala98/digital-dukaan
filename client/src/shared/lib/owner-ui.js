// Plain-English status text for owner screens ("out-for-delivery" -> "Out for delivery").
export const statusLabel = s => { const t = String(s || 'new').replace(/[-_]+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

// Mobile owner navigation, grouped by task. Keys not listed fall into "More" so a new tab never disappears.
export const NAV_GROUPS = [
  { id: 'today', label: 'Aaj ka kaam', keys: ['leads', 'restaurant', 'tables', 'sales'] },
  { id: 'shop', label: 'Dukaan', keys: ['products', 'categories', 'coupons', 'imports'] },
  { id: 'people', label: 'Customers', keys: ['customers', 'reviews', 'notifications', 'campaigns', 'broadcast', 'whatsapp-cloud'] },
  { id: 'setup', label: 'Setup', keys: ['settings', 'staff'] }
];
export function groupNavItems(items) {
  const home = items.filter(i => i[0] === 'overview');
  const rest = items.filter(i => i[0] !== 'overview');
  const used = new Set();
  const groups = NAV_GROUPS.map(g => ({ ...g, items: g.keys.map(k => rest.find(i => i[0] === k)).filter(Boolean) })).filter(g => g.items.length);
  groups.forEach(g => g.items.forEach(i => used.add(i[0])));
  const other = rest.filter(i => !used.has(i[0]));
  if (other.length) groups.push({ id: 'more', label: 'More', keys: other.map(i => i[0]), items: other });
  return { home: home[0] || null, groups };
}

// Owner-facing words per store type. Services take booking requests, not orders.
export const verticalWords = storeType => storeType === 'services'
  ? { orders: 'Bookings', requests: 'Booking requests', recent: 'Recent booking requests', requestsNote: 'Booking requests are not confirmed appointments until you confirm them.' }
  : { orders: 'Orders', requests: 'WhatsApp enquiries', recent: 'Recent enquiries', requestsNote: 'Enquiries are requests, not confirmed sales.' };

// One shared definition of the two money bases shown to restaurant owners, so Overview and Sales say the same thing.
export const SALES_BASIS = {
  served: 'Served value: orders that are served, delivered or picked up, counted on the day the order was placed (IST). Not proof of payment.',
  billed: 'Billed total: table bills settled in this range, counted on the day the bill was paid. Includes GST and extra charges, after discounts.',
  differ: 'The two can differ: a bill is counted when it is paid, a served order when it was placed, and a bill adds GST and charges.'
};
