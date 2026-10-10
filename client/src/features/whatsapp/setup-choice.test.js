import test from 'node:test';
import assert from 'node:assert/strict';
import { SETUP_COPY as C, waTestLink, loadSetupState, saveSetupState } from './setup-choice.js';
const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };
test('approved copy is exact and promises nothing extra', () => {
  assert.equal(C.heading, 'Choose your WhatsApp setup');
  assert.equal(C.basic.cta, 'Set up basic WhatsApp');
  assert.equal(C.auto.description, 'Connect your WhatsApp provider and check the required templates. Provider charges may apply.');
  assert.equal(C.later, 'Set up later');
  assert.ok(!C.auto.states.includes('Test received'));
  const all = JSON.stringify(C).toLowerCase();
  for (const w of ['free', 'instant', 'always-on', 'guaranteed']) assert.ok(!all.includes(w), w);
});
test('test link needs a plausible number and keeps digits only', () => {
  assert.equal(waTestLink('+91 98765-43210'), 'https://wa.me/919876543210');
  assert.equal(waTestLink(''), '');
  assert.equal(waTestLink('12'), '');
});
test('setup state round trips and survives bad storage', () => {
  const s = mem(); saveSetupState(7, { basicDone: true }, s);
  assert.deepEqual(loadSetupState(7, s), { basicDone: true, later: false });
  assert.deepEqual(loadSetupState(8, { getItem: () => '{oops' }), { basicDone: false, later: false });
});
