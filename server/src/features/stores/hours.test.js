import test from 'node:test';
import assert from 'node:assert/strict';
import { withinHours, effectiveOpen } from './hours.js';
test('window and overnight window', () => {
  assert.equal(withinHours('09:00', '21:00', 9 * 60), true);
  assert.equal(withinHours('09:00', '21:00', 21 * 60), false);
  assert.equal(withinHours('18:00', '02:00', 23 * 60), true);
  assert.equal(withinHours('18:00', '02:00', 3 * 60), false);
  assert.equal(withinHours('', '', 5), true);
});
test('manual close wins, auto off ignores times', () => {
  const noon = new Date('2026-10-06T06:30:00Z'); // 12:00 IST
  assert.equal(effectiveOpen({ isOpen: false, autoHours: true, openTime: '09:00', closeTime: '21:00' }, noon), false);
  assert.equal(effectiveOpen({ isOpen: true, autoHours: true, openTime: '13:00', closeTime: '21:00' }, noon), false);
  assert.equal(effectiveOpen({ isOpen: true, autoHours: true, openTime: '09:00', closeTime: '21:00' }, noon), true);
  assert.equal(effectiveOpen({ isOpen: true, autoHours: false, openTime: '13:00', closeTime: '21:00' }, noon), true);
});
import { blocksOrders } from './hours.js';
test('hard close defaults by store type and can be overridden', () => {
  const noon = new Date('2026-10-06T06:30:00Z');
  const closed = { isOpen: false };
  assert.equal(blocksOrders({ ...closed, storeType: 'restaurant' }, noon), true);
  assert.equal(blocksOrders({ ...closed, storeType: 'retail' }, noon), false);
  assert.equal(blocksOrders({ ...closed, storeType: 'restaurant', blockWhenClosed: false }, noon), false);
  assert.equal(blocksOrders({ ...closed, storeType: 'retail', blockWhenClosed: true }, noon), true);
  assert.equal(blocksOrders({ isOpen: true, storeType: 'restaurant', blockWhenClosed: true }, noon), false);
});
