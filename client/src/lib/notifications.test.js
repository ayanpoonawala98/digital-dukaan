import test from 'node:test';
import assert from 'node:assert/strict';
import { notify, dismissToast, toastSnapshot, subscribeToToasts, successFor } from './notifications.js';
test('toasts deduplicate, bound the stack, notify listeners and dismiss', () => {
  let updates = 0; const off = subscribeToToasts(() => updates++);
  notify('success', 'Saved'); notify('success', 'Saved');
  assert.equal(toastSnapshot().length, 1);
  notify('error', 'Failed'); notify('success', 'Three'); notify('success', 'Four'); notify('success', 'Five');
  assert.equal(toastSnapshot().length, 4); assert.equal(toastSnapshot()[0].message, 'Failed');
  toastSnapshot().forEach(item => dismissToast(item.id)); assert.equal(toastSnapshot().length, 0); assert.ok(updates >= 5); off();
});
test('success wording does not claim delivery or import before commit', () => {
  assert.equal(successFor('/owner/8/whatsapp-cloud/send', 'POST', { message: { status: 'unknown' } }), null);
  assert.match(successFor('/owner/8/whatsapp-cloud/send', 'POST', { message: { status: 'accepted' } }), /not yet confirmed/);
  assert.match(successFor('/owner/8/customers/import/preview', 'POST'), /Nothing has been imported/);
});
