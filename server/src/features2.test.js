import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePaymentKeys, paymentView, createPaymentLink, fetchPaymentLink, keyMode } from './razorpay.js';
import { invoiceSig, invoiceSigValid, invoiceUrl, streamBill } from './invoice.js';
import { weeklyText, lowStockItems } from './reports.js';
import { cleanSettings } from './notify.js';

process.env.JWT_SECRET = 'test-secret-for-bills';
const jsonRes = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });

test('razorpay keys validate, never leak the secret, and report mode', () => {
  const k = mergePaymentKeys({}, { keyId: 'rzp_test_AbCdEf123456', keySecret: 'SecretSecret1234' });
  assert.equal(keyMode(k.keyId), 'test');
  const v = paymentView(k); assert.equal(v.configured, true); assert.ok(!JSON.stringify(v).includes('SecretSecret')); assert.ok(!v.keyId.includes('AbCdEf123456'));
  assert.throws(() => mergePaymentKeys({}, { keyId: 'nope' }), /Key ID/);
  assert.throws(() => mergePaymentKeys({}, { keySecret: 'abcdefghij12' }), /Key ID/);
  assert.equal(mergePaymentKeys(k, { keySecret: '' }).keySecret, 'SecretSecret1234');
  assert.deepEqual(mergePaymentKeys(k, { clear: true }), {});
});
test('payment link request: paise, auth, https link only', async () => {
  let seen;
  const f = async (url, o) => { seen = { url, o }; return { ok: true, status: 200, json: async () => ({ id: 'plink_ABC123', short_url: 'https://rzp.io/i/abc', status: 'created' }) }; };
  const out = await createPaymentLink({ keyId: 'rzp_test_AbCdEf123456', keySecret: 'SecretSecret1234' }, { amount: 499.5, referenceId: 'L7', description: 'Order #7', name: 'Asha', phone: '9876543210' }, f);
  assert.equal(out.url, 'https://rzp.io/i/abc');
  const body = JSON.parse(seen.o.body);
  assert.equal(seen.url, 'https://api.razorpay.com/v1/payment_links'); assert.equal(body.amount, 49950); assert.equal(body.currency, 'INR'); assert.equal(body.customer.contact, '+919876543210'); assert.equal(body.notify.sms, false);
  assert.match(seen.o.headers.authorization, /^Basic /);
  await assert.rejects(createPaymentLink({ keyId: 'a', keySecret: 'b' }, { amount: 0.5, referenceId: 'x', description: 'y' }, f), /at least Rs 1/);
  await assert.rejects(createPaymentLink({ keyId: 'rzp_test_AbCdEf123456', keySecret: 'SecretSecret1234' }, { amount: 10, referenceId: 'x', description: 'y' }, async () => ({ ok: true, status: 200, json: async () => ({ id: 'plink_1', short_url: 'http://evil' }) })), /did not return/);
  await assert.rejects(createPaymentLink({ keyId: 'rzp_test_AbCdEf123456', keySecret: 'SecretSecret1234' }, { amount: 10, referenceId: 'x', description: 'y' }, jsonRes(401, {})), /rejected these keys/);
  await assert.rejects(createPaymentLink({}, { amount: 10, referenceId: 'x', description: 'y' }), /not set up/);
});
test('payment status only counts as paid when Razorpay says paid', async () => {
  const c = { keyId: 'rzp_test_AbCdEf123456', keySecret: 'SecretSecret1234' };
  assert.equal((await fetchPaymentLink(c, 'plink_ABC', jsonRes(200, { status: 'paid', amount_paid: 49950 }))).paid, true);
  assert.equal((await fetchPaymentLink(c, 'plink_ABC', jsonRes(200, { status: 'created', amount_paid: 0 }))).paid, false);
  await assert.rejects(fetchPaymentLink(c, '../x', jsonRes(200, {})), /No payment link/);
});
test('bill links are signed per order and kind', () => {
  assert.ok(invoiceSigValid('lead', 5, invoiceSig('lead', 5)));
  assert.ok(!invoiceSigValid('lead', 6, invoiceSig('lead', 5))); assert.ok(!invoiceSigValid('restaurant', 5, invoiceSig('lead', 5))); assert.ok(!invoiceSigValid('lead', 5, 'x'));
  assert.match(invoiceUrl('https://api.example.com/', 'lead', 5), /^https:\/\/api\.example\.com\/api\/public\/bill\/lead\/5\/[0-9a-f]{32}$/);
});
test('bill PDF renders for retail and restaurant', async () => {
  for (const [kind, order] of [['lead', { id: 1, productName: 'Frame', price: 500, items: [{ name: 'Frame', qty: 1, price: 500 }], createdAt: new Date(), paymentStatus: 'paid' }], ['restaurant', { id: 2, total: 300, items: [{ name: 'Chai', qty: 2, price: 150 }], createdAt: new Date() }]]) {
    const chunks = []; const res = { setHeader() {}, on() { return res; }, once() { return res; }, emit() {}, write: c => { chunks.push(Buffer.from(c)); return true; }, end: c => { if (c) chunks.push(Buffer.from(c)); res.done(); } };
    await new Promise(resolve => { res.done = resolve; streamBill(res, { name: 'Shop' }, order, kind); });
    assert.equal(Buffer.concat(chunks).subarray(0, 4).toString(), '%PDF');
  }
});
test('low stock list and weekly text; settings keep new fields', () => {
  const low = lowStockItems([{ id: 1, name: 'A', stock: 2, active: true }, { id: 2, name: 'B', stock: null, active: true }, { id: 3, name: 'C', stock: 9, active: true }, { id: 4, name: 'D', stock: 0, active: true }, { id: 5, name: 'E', stock: 1, active: false }], 5);
  assert.deepEqual(low.map(p => p.name), ['D', 'A']);
  const now = new Date('2026-10-05T10:00:00+05:30');
  const leads = [{ status: 'new', price: 500, productName: 'Frame', createdAt: new Date('2026-10-04T10:00:00+05:30') }];
  const t = weeklyText({ name: 'Shop', storeType: 'retail' }, leads, [], low, now);
  assert.match(t, /Enquiries: 1/); assert.match(t, /not confirmed sales/); assert.match(t, /Low stock: D \(0\), A \(2\)/);
  const r = weeklyText({ name: 'Cafe', storeType: 'restaurant' }, [], [{ status: 'served', total: 400, items: [{ name: 'Tea', qty: 2, price: 200 }], createdAt: new Date('2026-10-04T12:00:00+05:30') }], [], now);
  assert.match(r, /Served: 1/); assert.match(r, /Tea \(2\)/);
  const s = cleanSettings({ lowStockAlerts: true, lowStockThreshold: 500, weeklyReport: true, lastWeeklyDate: '2026-10-05' });
  assert.equal(s.lowStockThreshold, 100); assert.equal(s.weeklyReport, true); assert.equal(s.lastWeeklyDate, '2026-10-05'); assert.equal(cleanSettings({}).lowStockThreshold, 5);
});

test('bill links signed with the legacy JWT_SECRET stay valid after INVOICE_LINK_SECRET is set', () => {
  const prevJwt = process.env.JWT_SECRET, prevInv = process.env.INVOICE_LINK_SECRET;
  try {
    process.env.JWT_SECRET = 'legacy-jwt-secret-for-bill-test-0123456789'; delete process.env.INVOICE_LINK_SECRET;
    const oldSig = invoiceSig('lead', 9);
    process.env.INVOICE_LINK_SECRET = 'new-invoice-secret-for-bill-test-0123456789';
    assert.ok(invoiceSigValid('lead', 9, oldSig));
    assert.ok(invoiceSigValid('lead', 9, invoiceSig('lead', 9)));
    assert.notEqual(oldSig, invoiceSig('lead', 9));
    assert.ok(!invoiceSigValid('lead', 10, oldSig));
  } finally { process.env.JWT_SECRET = prevJwt; if (prevInv === undefined) delete process.env.INVOICE_LINK_SECRET; else process.env.INVOICE_LINK_SECRET = prevInv; }
});
