import test from 'node:test';
import assert from 'node:assert/strict';
import { statusLabel, groupNavItems } from './owner-ui.js';
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
