import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFieldDefs, validateAnswers, answersLines } from './custom-fields.js';
import { whatsappUrl, whatsappCartUrl } from './utils/core.js';

const defs = cleanFieldDefs([
  { label: 'Lens type', type: 'select', options: 'Single vision, Blue-cut, Progressive', required: true },
  { label: 'Right eye power', type: 'number' },
  { label: 'Note', type: 'text', required: false },
]);
test('field definitions are cleaned, ids unique, selects need 2 choices', () => {
  assert.deepEqual(defs.map(d => d.id), ['lens-type', 'right-eye-power', 'note']);
  assert.deepEqual(defs[0].options, ['Single vision', 'Blue-cut', 'Progressive']); assert.equal(defs[0].required, true);
  const dup = cleanFieldDefs([{ label: 'A b', type: 'text' }, { label: 'A b', type: 'text' }]); assert.notEqual(dup[0].id, dup[1].id);
  assert.throws(() => cleanFieldDefs([{ label: 'X', type: 'select', options: ['one'] }]), /two choices/);
  assert.throws(() => cleanFieldDefs([{ label: '', type: 'text' }]), /label/);
  assert.throws(() => cleanFieldDefs(Array(13).fill({ label: 'a', type: 'text' })), /at most 12/);
  assert.equal(cleanFieldDefs(undefined), undefined); assert.deepEqual(cleanFieldDefs([]), []);
});
test('answers: required, option membership, negative decimal powers, junk ignored', () => {
  assert.throws(() => validateAnswers(defs, {}, 'Frame'), /Please answer "Lens type" for Frame/);
  assert.throws(() => validateAnswers(defs, { 'lens-type': 'Hacked' }), /listed options/);
  assert.throws(() => validateAnswers(defs, { 'lens-type': 'Blue-cut', 'right-eye-power': 'abc' }), /must be a number/);
  const ok = validateAnswers(defs, { 'lens-type': 'Blue-cut', 'right-eye-power': '-2.25', note: '  hello\nworld ', other: 'ignored' });
  assert.deepEqual(ok, [{ label: 'Lens type', value: 'Blue-cut' }, { label: 'Right eye power', value: '-2.25' }, { label: 'Note', value: 'hello world' }]);
  assert.deepEqual(validateAnswers([], { a: 'b' }), []); assert.deepEqual(validateAnswers(undefined, null), []);
  assert.deepEqual(answersLines(ok), ['Lens type: Blue-cut', 'Right eye power: -2.25', 'Note: hello world']);
});
test('answers reach the WhatsApp message to the shop', () => {
  const a = [{ label: 'Lens type', value: 'Blue-cut' }];
  assert.match(decodeURIComponent(whatsappUrl({ whatsapp: '919999999999' }, { id: 1, name: 'Frame', price: 500 }, '', a)), /Lens type: Blue-cut/);
  assert.match(decodeURIComponent(whatsappCartUrl({ name: 'S', whatsapp: '919999999999' }, [{ qty: 1, name: 'Frame', price: 500, answers: a }], 500, 0, 500, '')), /1 x Frame[\s\S]*Lens type: Blue-cut/);
});
