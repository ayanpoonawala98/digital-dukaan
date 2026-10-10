import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanVariants, cleanAddonGroups, buildLine, isSoldOutToday, istDay } from './menu-options.js';
const product = { id: 7, name: 'Paneer Tikka', price: 200, veg: 'veg', variants: cleanVariants([{ name: 'Half', price: 120 }, { name: 'Full', price: 220 }]), addonGroups: cleanAddonGroups([{ name: 'Extras', max: 2, options: [{ name: 'Cheese', price: 30 }, { name: 'Mint dip', price: 10 }] }, { name: 'Spice', required: true, max: 1, options: [{ name: 'Mild' }, { name: 'Hot' }] }]) };
test('priced on server from variant and add-ons', () => {
  const line = buildLine(product, { variant: 'Full', addons: { g1: ['Cheese', 'Mint dip'], g2: ['Hot'] }, note: ' less oil ' }, 2);
  assert.equal(line.price, 260); assert.equal(line.qty, 2); assert.equal(line.note, 'less oil'); assert.equal(line.addons.length, 3);
});
test('rejects missing size, missing required group, too many choices, unknown option', () => {
  assert.throws(() => buildLine(product, { addons: { g2: ['Hot'] } }, 1), /size/);
  assert.throws(() => buildLine(product, { variant: 'Half' }, 1), /Spice/);
  assert.throws(() => buildLine(product, { variant: 'Half', addons: { g1: ['Cheese', 'Mint dip', 'x'], g2: ['Hot'] } }, 1), /at most|Invalid/);
  assert.throws(() => buildLine(product, { variant: 'Half', addons: { g2: ['Lava'] } }, 1), /Invalid/);
  assert.throws(() => buildLine(product, { variant: 'Half', addons: { zz: ['a'], g2: ['Hot'] } }, 1), /Unknown/);
});
test('plain product keeps its price', () => assert.equal(buildLine({ id: 1, name: 'Tea', price: 15 }, { id: 1 }, 1).price, 15));
test('sold out only on the same India day', () => {
  assert.ok(isSoldOutToday({ soldOutDate: istDay() })); assert.ok(!isSoldOutToday({ soldOutDate: '2020-01-01' })); assert.ok(!isSoldOutToday({}));
});
