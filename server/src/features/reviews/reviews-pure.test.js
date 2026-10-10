import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanReview, reviewerKey, publicName, reviewableProducts, summarize } from './reviews-pure.js';

test('rating and text validation', () => {
  assert.deepEqual(cleanReview({ rating: 5, text: '  great   food ' }), { rating: 5, text: 'great food' });
  assert.equal(cleanReview({ rating: 5 }).text, '');
  for (const r of [0, 6, 2.5, '', null, 'x']) assert.ok(cleanReview({ rating: r }).error, String(r));
  assert.ok(cleanReview({ rating: 3, text: 'x'.repeat(601) }).error);
});
test('reviewer identity prefers the phone, else the order', () => {
  assert.equal(reviewerKey({ id: 4 }, 'lead', '919876543210'), '919876543210');
  assert.equal(reviewerKey({ id: 4 }, 'lead', null), 'lead:4');
});
test('public name never leaks contact details', () => {
  assert.equal(publicName('Ayan Poonawala'), 'Ayan'); assert.equal(publicName(''), 'Customer'); assert.equal(publicName('9876543210'), 'Customer'); assert.equal(publicName('a@b.com'), 'Customer');
});
test('only non-cancelled order lines can be reviewed, once per product', () => {
  const order = { status: 'delivered', items: [{ productId: 3, name: 'Tea' }, { productId: 3, name: 'Tea' }, { productId: 9, name: 'Cake' }, { name: 'ghost' }] };
  assert.deepEqual(reviewableProducts(order), [{ productId: 3, name: 'Tea' }, { productId: 9, name: 'Cake' }]);
  assert.deepEqual(reviewableProducts({ ...order, status: 'cancelled' }), []);
  assert.deepEqual(reviewableProducts({ status: 'new', items: [], productId: 7, productName: 'Shirt' }), [{ productId: 7, name: 'Shirt' }]);
  assert.deepEqual(reviewableProducts(null), []);
});
test('summary rounds to one decimal', () => {
  assert.deepEqual(summarize([{ rating: 5 }, { rating: 4 }, { rating: 4 }]), { count: 3, avg: 4.3, distribution: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 1 } });
  assert.equal(summarize([]).avg, 0);
});
