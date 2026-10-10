import test from 'node:test';
import assert from 'node:assert/strict';
import { orderLine, addedLine } from './bill-lines.js';
const order = { id: 9, items: [
  { productId: 1, name: 'Paneer Tikka', price: 260, qty: 1, variant: 'Full', addons: [{ group: 'Extras', name: 'Cheese', price: 30 }], note: 'less oil' },
  { productId: 1, name: 'Paneer Tikka', price: 120, qty: 2, variant: 'Half' }] };
test('same dish with different variants keeps each saved price', () => {
  assert.equal(orderLine({ itemIdx: 0 }, order, 1).price, 260);
  const half = orderLine({ itemIdx: 1 }, order, 3);
  assert.equal(half.price, 120); assert.equal(half.variant, 'Half'); assert.equal(half.qty, 3);
});
test('options and note are copied from the order, not the client', () => {
  const l = orderLine({ itemIdx: 0, price: 1, variant: 'Half', note: 'x' }, order, 1);
  assert.equal(l.variant, 'Full'); assert.equal(l.note, 'less oil'); assert.equal(l.addons[0].name, 'Cheese'); assert.equal(l.price, 260);
});
test('old clients matching by name still work; unknown items are rejected', () => {
  assert.equal(orderLine({ name: 'Paneer Tikka' }, order, 1).itemIdx, 0);
  assert.throws(() => orderLine({ itemIdx: 7 }, order, 1), /does not match/);
  assert.throws(() => orderLine({ name: 'Ghost' }, order, 1), /does not match/);
});
test('added line uses the variant price and needs a size when sizes exist', () => {
  const p = { id: 4, name: 'Biryani', price: 200, variants: [{ name: 'Half', price: 120 }, { name: 'Full', price: 220 }] };
  assert.equal(addedLine({ variant: 'Full', price: 1 }, p, 2).price, 220);
  assert.throws(() => addedLine({}, p, 1), /Choose a size/);
  assert.equal(addedLine({}, { id: 5, name: 'Tea', price: 20 }, 1).price, 20);
});
