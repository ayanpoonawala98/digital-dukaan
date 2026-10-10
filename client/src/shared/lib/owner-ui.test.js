import test from 'node:test';
import assert from 'node:assert/strict';
import { statusLabel, groupNavItems, verticalWords } from './owner-ui.js';
test('status labels are humanised', () => {
  assert.equal(statusLabel('out-for-delivery'), 'Out for delivery');
  assert.equal(statusLabel('in-progress'), 'In progress');
  assert.equal(statusLabel(''), 'New');
});
test('nav groups keep every item exactly once and put unknown tabs in More', () => {
  const items = [['overview'], ['leads'], ['products'], ['customers'], ['settings'], ['weird'], ['clients']];
  const { home, groups } = groupNavItems(items);
  assert.equal(home[0], 'overview');
  const all = groups.flatMap(g => g.items.map(i => i[0])).sort();
  assert.deepEqual(all, ['clients', 'customers', 'leads', 'products', 'settings', 'weird']);
  assert.equal(groups.at(-1).id, 'more');
});
test('services use booking words, others keep order words', () => {
  assert.equal(verticalWords('services').orders, 'Bookings');
  assert.equal(verticalWords('retail').orders, 'Orders');
  assert.equal(verticalWords(undefined).recent, 'Recent enquiries');
});
test('every owner tab is reachable from a named mobile group', () => {
  const keys = ['leads', 'restaurant', 'tables', 'sales', 'products', 'categories', 'coupons', 'imports', 'customers', 'reviews', 'notifications', 'campaigns', 'broadcast', 'whatsapp-cloud', 'settings', 'staff'];
  const { groups } = groupNavItems([['overview'], ...keys.map(k => [k])]);
  assert.deepEqual(groups.flatMap(g => g.items.map(i => i[0])).sort(), [...keys].sort());
  assert.ok(!groups.some(g => g.id === 'more'));
});
