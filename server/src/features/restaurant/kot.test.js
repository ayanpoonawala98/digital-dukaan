import test from 'node:test';
import assert from 'node:assert/strict';
import { kotLines, printedMap } from './kot-lines.js';
const a = { productId: 1, name: 'Paneer Tikka', qty: 2, variant: 'Full', note: 'less oil' };
const b = { productId: 2, name: 'Naan', qty: 3, addons: [{ group: 'Extras', name: 'Butter' }] };
test('first ticket lists everything with options', () => {
  const l = kotLines([a, b], {});
  assert.equal(l.length, 2); assert.equal(l[0].variant, 'Full'); assert.equal(l[0].note, 'less oil'); assert.deepEqual(l[1].addons, ['Butter']);
});
test('after add-items only new quantities print', () => {
  const printed = printedMap([a, b]);
  assert.equal(kotLines([a, b], printed).length, 0);
  const l = kotLines([{ ...a, qty: 3 }, b, { productId: 3, name: 'Lassi', qty: 1 }], printed);
  assert.deepEqual(l.map(x => [x.name, x.qty]), [['Paneer Tikka', 1], ['Lassi', 1]]);
});
test('reprint all ignores history', () => { assert.equal(kotLines([a, b], printedMap([a, b]), 'all').length, 2); });
import { revisedLines } from './kot-lines.js';
test('lowered or removed lines are reported after a print, names kept', () => {
  const printed = printedMap([a, b]);
  assert.deepEqual(revisedLines([a, b], printed), []);
  assert.deepEqual(revisedLines([{ ...a, qty: 1 }, b], printed).map(x => [x.name, x.from, x.to]), [['Paneer Tikka Full', 2, 1]]);
  assert.deepEqual(revisedLines([a], printed).map(x => [x.name, x.from, x.to]), [['Naan', 3, 0]]);
  assert.equal(kotLines([{ ...a, qty: 1 }, b], printed).length, 0);
});
