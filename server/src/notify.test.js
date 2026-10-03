import test from 'node:test';
import assert from 'node:assert/strict';
import { providerStatus, indianMobile, cleanSettings, sendEmail, sendSms, notifyNewOrder, notifyStatusChange } from './notify.js';

const calls = [];
const okFetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ return: true }) }; };
const KEYS = { RESEND_API_KEY: 're_x', EMAIL_FROM: 'Shop <a@b.co>', FAST2SMS_API_KEY: 'k' };
const store = { id: 1, name: 'Demo', ownerId: 9, notifySettings: { ownerEmailAlerts: true, ownerEmail: 'o@x.com', ownerSmsAlerts: true, ownerPhone: '9876543210', customerSms: true } };

test('nothing is sent and nothing throws without keys', async () => {
  calls.length = 0;
  assert.deepEqual(providerStatus({}), { email: { provider: 'Resend', configured: false }, sms: { provider: 'Fast2SMS', mode: 'quick', configured: false } });
  assert.equal((await sendEmail({ to: 'a@b.co', subject: 's', text: 't' }, { env: {}, fetchImpl: okFetch })).ok, false);
  assert.equal((await sendSms({ to: '9876543210', text: 't' }, { env: {}, fetchImpl: okFetch })).ok, false);
  assert.deepEqual(await notifyNewOrder(store, 'lead', { id: 1, price: 10 }, { env: {}, fetchImpl: okFetch }), []);
  assert.equal(calls.length, 0);
});
test('indian mobile normalising', () => {
  assert.equal(indianMobile('+91 98765-43210'), '9876543210');
  assert.equal(indianMobile('09876543210'), '9876543210');
  assert.equal(indianMobile('12345'), null);
  assert.equal(indianMobile('+1 415 555 0123'), null);
});
test('settings default to off and ignore junk', () => {
  assert.deepEqual(cleanSettings(undefined), { ownerEmailAlerts: false, ownerEmail: '', ownerSmsAlerts: false, ownerPhone: '', customerSms: false });
  assert.equal(cleanSettings({ customerSms: 'yes' }).customerSms, false);
});
test('new enquiry alerts owner by email and SMS and confirms to the customer', async () => {
  calls.length = 0;
  const res = await notifyNewOrder(store, 'lead', { id: 5, productName: 'Kurta', price: 999, customerName: 'Asha', customerPhone: '9123456789' }, { env: KEYS, fetchImpl: okFetch });
  assert.equal(res.length, 3); assert.ok(res.every(r => r.ok));
  assert.equal(calls.filter(c => c.url.includes('resend')).length, 1);
  const sms = calls.filter(c => c.url.includes('fast2sms')).map(c => JSON.parse(c.opts.body).numbers).sort();
  assert.deepEqual(sms, ['9123456789', '9876543210']);
  assert.equal(calls[0].opts.headers.Authorization.includes('re_x') || calls[1].opts.headers.Authorization === 'k', true);
});
test('customer SMS only when opted in and phone present; provider failures do not throw', async () => {
  calls.length = 0;
  const off = { ...store, notifySettings: { ownerEmailAlerts: false } };
  assert.deepEqual(await notifyStatusChange(off, 'lead', { id: 1, customerPhone: '9123456789' }, 'shipped', { env: KEYS, fetchImpl: okFetch }), []);
  assert.deepEqual(await notifyStatusChange(store, 'lead', { id: 1, customerPhone: '' }, 'shipped', { env: KEYS, fetchImpl: okFetch }), []);
  const boom = async () => { throw new Error('network'); };
  const r = await notifyStatusChange(store, 'lead', { id: 1, customerPhone: '9123456789' }, 'shipped', { env: KEYS, fetchImpl: boom });
  assert.equal(r[0].ok, false); assert.equal(calls.length, 0);
});
test('DLT mode needs sender and template ids', () => {
  assert.equal(providerStatus({ FAST2SMS_API_KEY: 'k', FAST2SMS_ROUTE: 'dlt' }).sms.configured, false);
  assert.equal(providerStatus({ FAST2SMS_API_KEY: 'k', FAST2SMS_ROUTE: 'dlt', FAST2SMS_SENDER_ID: 'ABCDEF', FAST2SMS_TEMPLATE_ID: '1' }).sms.configured, true);
});
