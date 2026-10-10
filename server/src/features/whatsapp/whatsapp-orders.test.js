import test from 'node:test';
import assert from 'node:assert/strict';
import { orderRef, parseOrderRef, withOrderRef, confirmationText, statusMessage, orderBotEnabledFor } from './whatsapp-orders.js';
test('order ref round trip', () => {
  assert.equal(orderRef(42), 'DD-42');
  assert.equal(parseOrderRef('Hi\nOrder ref: DD-42'), 42);
  assert.equal(parseOrderRef('no ref here'), null);
  const u = new URL(withOrderRef('https://wa.me/919999999999?text=Hi', 7));
  assert.equal(u.searchParams.get('text'), 'Hi\nOrder ref: DD-7');
});
test('bot is off by default and per store', () => {
  delete process.env.WHATSAPP_ORDER_BOT_ENABLED; delete process.env.WHATSAPP_ORDER_BOT_BUSINESS_IDS;
  assert.equal(orderBotEnabledFor(1), false);
  process.env.WHATSAPP_ORDER_BOT_ENABLED = 'true'; process.env.WHATSAPP_ORDER_BOT_BUSINESS_IDS = '1';
  assert.equal(orderBotEnabledFor(1), true); assert.equal(orderBotEnabledFor(2), false);
  delete process.env.WHATSAPP_ORDER_BOT_ENABLED; delete process.env.WHATSAPP_ORDER_BOT_BUSINESS_IDS;
});
test('messages', () => {
  const store = { name: 'Shop' }, lead = { id: 5, price: 250, items: [{ qty: 2, name: 'Pen' }] };
  assert.match(confirmationText(store, lead), /DD-5[\s\S]*2 x Pen[\s\S]*Rs\.250\.00/);
  assert.equal(statusMessage(store, lead, 'shipped'), 'Shop: your order DD-5 is shipped');
  assert.equal(statusMessage(store, lead, 'weird'), null);
});

import { newClaimCode, parseOrderClaim, decideOrderAccess } from './whatsapp-orders.js';
test('claim code is random, 8 chars, and carried in the order text', () => {
  const a = newClaimCode(), b = newClaimCode();
  assert.match(a, /^[A-HJ-NP-Z2-9]{8}$/); assert.notEqual(a, b);
  const u = new URL(withOrderRef('https://wa.me/919999999999?text=Hi', 7, a));
  assert.deepEqual(parseOrderClaim(u.searchParams.get('text')), { id: 7, code: a });
  assert.deepEqual(parseOrderClaim('order ref: dd-7'), { id: 7, code: null });
  assert.equal(parseOrderClaim('nothing'), null);
});
test('order details only go to the phone on the order, or to a holder of the claim code', () => {
  const withPhone = { customerPhone: '+91 98765 43210', claimCode: 'ABCD2345' };
  assert.equal(decideOrderAccess(withPhone, '919876543210', null), 'match');
  assert.equal(decideOrderAccess(withPhone, '919111111111', null), 'deny');
  assert.equal(decideOrderAccess(withPhone, '919111111111', 'ABCD2345'), 'deny'); // code never overrides a recorded phone
  const phoneless = { customerPhone: '', claimCode: 'ABCD2345' };
  assert.equal(decideOrderAccess(phoneless, '919111111111', null), 'deny'); // DD-id alone is not enough
  assert.equal(decideOrderAccess(phoneless, '919111111111', 'WRONGONE'), 'deny');
  assert.equal(decideOrderAccess(phoneless, '919111111111', 'abcd2345'), 'claim');
  assert.equal(decideOrderAccess({ customerPhone: '', claimCode: null }, '919111111111', 'ABCD2345'), 'deny'); // used or old order
  assert.equal(decideOrderAccess(null, '919111111111', 'ABCD2345'), 'deny');
});
